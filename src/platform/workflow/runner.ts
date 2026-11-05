/**
 * Workflow runner.
 *
 * Accepts a WorkflowDef + trigger payload + ExprContext, executes all actions
 * in order (by rank), respecting parentId nesting and control flow.
 */

import dns from 'dns/promises';
import { Pool } from 'pg';
import type { WorkflowDef, ActionDef, ActionType } from '@/platform/contracts/rules';
import type { ExprEngine, ExprContext, ExprValue } from '@/platform/expr';
import type { TableDef } from '@/platform/contracts';
import { insertRecord, updateRecord, deleteRecord } from '@/platform/data/crud';
import { withTenantTx } from '@/platform/data/client';
import {
  WorkflowTimeoutError,
  WorkflowLoopError,
  NotConfiguredError,
} from './errors';

// ─── SSRF guard (private copy for call_api) ───────────────────────────────────

const PRIVATE_RANGES: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

async function assertSsrfSafe(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SSRF blocked: invalid URL (url: ${url})`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF blocked: hostname "${hostname}" is blocked (url: ${url})`);
  }
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new Error(`SSRF blocked: DNS resolution failed for "${hostname}" (url: ${url})`);
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`SSRF blocked: IP ${addr} is private (url: ${url})`);
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowRunLogEntry {
  actionId: string;
  actionType: ActionType;
  status: 'success' | 'failure' | 'skipped';
  startedAt: Date;
  durationMs: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  status: 'success' | 'failure' | 'timeout' | 'loop_error';
  triggerEvent: string;
  workflowId: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  logs: WorkflowRunLogEntry[];
  error?: string;
}

export interface RunnerOptions {
  pool: Pool;
  tenantSlug: string;
  exprEngine: ExprEngine;
  /** Override for table definitions (used for record operations). */
  getTableDef?: (tableId: string) => Promise<TableDef | null>;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runWorkflow(
  workflow: WorkflowDef,
  triggerPayload: unknown,
  ctx: ExprContext,
  opts: RunnerOptions,
): Promise<WorkflowRunResult> {
  const startedAt = new Date();
  const logs: WorkflowRunLogEntry[] = [];
  const timeoutMs = (workflow.runTimeoutSeconds ?? 30) * 1000;
  const maxLoopIterations = workflow.maxLoopIterations ?? 100;

  const runnerCtx: MutableExprContext = {
    ...ctx,
    vars: { ...(ctx.vars ?? {}), _trigger: triggerPayload as ExprValue },
  };

  async function execute(): Promise<void> {
    // Top-level actions (no parentId)
    const topLevel = workflow.actions
      .filter((a) => !a.parentId)
      .sort((a, b) => a.rank - b.rank);

    await executeActions(topLevel, runnerCtx, logs, {
      workflow,
      opts,
      maxLoopIterations,
      loopCounter: { count: 0 },
    });
  }

  try {
    await Promise.race([
      execute(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new WorkflowTimeoutError(workflow.runTimeoutSeconds ?? 30)),
          timeoutMs,
        ),
      ),
    ]);

    const endedAt = new Date();
    return {
      status: 'success',
      triggerEvent: workflow.trigger.event,
      workflowId: workflow.id,
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      logs,
    };
  } catch (err) {
    const endedAt = new Date();
    let status: WorkflowRunResult['status'] = 'failure';
    if (err instanceof WorkflowTimeoutError) status = 'timeout';
    if (err instanceof WorkflowLoopError) status = 'loop_error';

    return {
      status,
      triggerEvent: workflow.trigger.event,
      workflowId: workflow.id,
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type MutableExprContext = {
  -readonly [K in keyof ExprContext]: ExprContext[K];
} & { vars: Record<string, ExprValue> };

interface ExecuteOpts {
  workflow: WorkflowDef;
  opts: RunnerOptions;
  maxLoopIterations: number;
  loopCounter: { count: number };
}

async function executeActions(
  actions: ActionDef[],
  ctx: MutableExprContext,
  logs: WorkflowRunLogEntry[],
  execOpts: ExecuteOpts,
): Promise<void> {
  // Group into transaction blocks if needed
  const groups = groupByTransaction(actions);
  for (const group of groups) {
    if (group.inTransaction) {
      await runInTransaction(group.actions, ctx, logs, execOpts);
    } else {
      for (const action of group.actions) {
        await executeAction(action, ctx, logs, execOpts);
      }
    }
  }
}

function groupByTransaction(
  actions: ActionDef[],
): Array<{ inTransaction: boolean; actions: ActionDef[] }> {
  const groups: Array<{ inTransaction: boolean; actions: ActionDef[] }> = [];
  let currentGroup: { inTransaction: boolean; actions: ActionDef[] } | null = null;

  for (const action of actions) {
    const inTx = action.runInTransaction ?? false;
    if (!currentGroup || currentGroup.inTransaction !== inTx) {
      currentGroup = { inTransaction: inTx, actions: [] };
      groups.push(currentGroup);
    }
    currentGroup.actions.push(action);
  }
  return groups;
}

async function runInTransaction(
  actions: ActionDef[],
  ctx: MutableExprContext,
  logs: WorkflowRunLogEntry[],
  execOpts: ExecuteOpts,
): Promise<void> {
  const { opts } = execOpts;
  const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: ctx.user?.locations ?? [] };
  await withTenantTx(opts.pool, opts.tenantSlug, claims, async () => {
    for (const action of actions) {
      await executeAction(action, ctx, logs, execOpts);
    }
  });
}

async function executeAction(
  action: ActionDef,
  ctx: MutableExprContext,
  logs: WorkflowRunLogEntry[],
  execOpts: ExecuteOpts,
): Promise<void> {
  const startedAt = new Date();

  async function run(): Promise<unknown> {
    return dispatchAction(action, ctx, logs, execOpts);
  }

  if (action.continueOnError) {
    try {
      const output = await run();
      appendLog(logs, action, 'success', startedAt, output);
    } catch (err) {
      appendLog(logs, action, 'failure', startedAt, undefined, err);
    }
  } else {
    try {
      const output = await run();
      appendLog(logs, action, 'success', startedAt, output);
    } catch (err) {
      appendLog(logs, action, 'failure', startedAt, undefined, err);
      throw err;
    }
  }
}

function appendLog(
  logs: WorkflowRunLogEntry[],
  action: ActionDef,
  status: WorkflowRunLogEntry['status'],
  startedAt: Date,
  output?: unknown,
  err?: unknown,
): void {
  logs.push({
    actionId: action.id,
    actionType: action.actionType,
    status,
    startedAt,
    durationMs: Date.now() - startedAt.getTime(),
    output,
    error: err instanceof Error ? err.message : err != null ? String(err) : undefined,
  });
}

function childrenOf(
  parentId: string,
  workflow: WorkflowDef,
): ActionDef[] {
  return workflow.actions
    .filter((a) => a.parentId === parentId)
    .sort((a, b) => a.rank - b.rank);
}

// ─── Action dispatcher ────────────────────────────────────────────────────────

async function dispatchAction(
  action: ActionDef,
  ctx: MutableExprContext,
  logs: WorkflowRunLogEntry[],
  execOpts: ExecuteOpts,
): Promise<unknown> {
  const { workflow, opts, maxLoopIterations, loopCounter } = execOpts;
  const { exprEngine } = opts;

  switch (action.actionType) {
    // ── Control flow ──────────────────────────────────────────────────────────

    case 'if_else': {
      const condition = action.config['condition'] as string;
      const result = exprEngine.evaluateSource(condition, ctx);
      const branch = result ? 'then' : 'else';
      const children = childrenOf(action.id, workflow);
      const branchChildren = children.filter(
        (c) => (c.config['branch'] as string) === branch,
      );
      await executeActions(branchChildren, ctx, logs, execOpts);
      return { branch, result };
    }

    case 'switch': {
      const valueExpr = action.config['value'] as string;
      const value = exprEngine.evaluateSource(valueExpr, ctx);
      const children = childrenOf(action.id, workflow);
      let matched = false;
      for (const child of children) {
        const caseValue = child.config['case'];
        if (caseValue === value || (caseValue === 'default' && !matched)) {
          matched = true;
          await executeAction(child, ctx, logs, execOpts);
          break;
        }
      }
      return { value, matched };
    }

    case 'for_each': {
      const itemsExpr = action.config['items'] as string;
      const varName = (action.config['varName'] as string) ?? '_item';
      const items = exprEngine.evaluateSource(itemsExpr, ctx);
      const arr = Array.isArray(items) ? items : [items];
      const children = childrenOf(action.id, workflow);

      for (const item of arr) {
        loopCounter.count++;
        if (loopCounter.count > maxLoopIterations) {
          throw new WorkflowLoopError(maxLoopIterations);
        }
        ctx.vars[varName] = item as ExprValue;
        await executeActions(children, ctx, logs, execOpts);
      }
      return { iterations: arr.length };
    }

    case 'try_catch': {
      const tryChildren = childrenOf(action.id, workflow).filter(
        (c) => c.config['block'] === 'try' || c.config['block'] == null,
      );
      const catchChildren = childrenOf(action.id, workflow).filter(
        (c) => c.config['block'] === 'catch',
      );
      const finallyChildren = childrenOf(action.id, workflow).filter(
        (c) => c.config['block'] === 'finally',
      );

      let caughtError: string | undefined;
      try {
        await executeActions(tryChildren, ctx, logs, execOpts);
      } catch (err) {
        caughtError = err instanceof Error ? err.message : String(err);
        ctx.vars['_error'] = caughtError;
        await executeActions(catchChildren, ctx, logs, execOpts);
      } finally {
        await executeActions(finallyChildren, ctx, logs, execOpts);
      }
      return { caught: caughtError };
    }

    // ── Data operations ───────────────────────────────────────────────────────

    case 'create_record': {
      const tableId = action.config['tableId'] as string;
      const dataExpr = action.config['data'] as Record<string, string>;
      const tableDef = await resolveTableDef(tableId, opts);
      const data: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(dataExpr)) {
        data[key] = exprEngine.evaluateSource(expr, ctx);
      }
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: ctx.user?.locations ?? [] };
      const record = await insertRecord(opts.pool, opts.tenantSlug, tableDef, data, { userId: claims.userId, claims }, exprEngine);
      ctx.vars['_created'] = record as ExprValue;
      return record;
    }

    case 'update_record': {
      const tableId = action.config['tableId'] as string;
      const recordIdExpr = action.config['recordId'] as string;
      const dataExpr = action.config['data'] as Record<string, string>;
      const tableDef = await resolveTableDef(tableId, opts);
      const recordId = String(exprEngine.evaluateSource(recordIdExpr, ctx));
      const data: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(dataExpr)) {
        data[key] = exprEngine.evaluateSource(expr, ctx);
      }
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: ctx.user?.locations ?? [] };
      const record = await updateRecord(opts.pool, opts.tenantSlug, tableDef, recordId, data, { userId: claims.userId, claims }, exprEngine);
      ctx.vars['_updated'] = record as ExprValue;
      return record;
    }

    case 'delete_record': {
      const tableId = action.config['tableId'] as string;
      const recordIdExpr = action.config['recordId'] as string;
      const tableDef = await resolveTableDef(tableId, opts);
      const recordId = String(exprEngine.evaluateSource(recordIdExpr, ctx));
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: ctx.user?.locations ?? [] };
      await deleteRecord(opts.pool, opts.tenantSlug, tableDef, recordId, { userId: claims.userId, claims }, exprEngine);
      return { deleted: recordId };
    }

    case 'run_query': {
      const sql = action.config['sql'] as string;
      const params = (action.config['params'] as unknown[]) ?? [];
      const result = await opts.pool.query(sql, params);
      ctx.vars['_queryResult'] = result.rows as ExprValue;
      return result.rows;
    }

    case 'set_variable': {
      const name = action.config['name'] as string;
      const valueExpr = action.config['value'] as string;
      const value = exprEngine.evaluateSource(valueExpr, ctx);
      ctx.vars[name] = value as ExprValue;
      return { [name]: value };
    }

    // ── Integrations ──────────────────────────────────────────────────────────

    case 'send_email': {
      throw new NotConfiguredError('Email integration');
    }

    case 'send_whatsapp': {
      throw new NotConfiguredError('WhatsApp integration');
    }

    case 'generate_pdf': {
      throw new NotConfiguredError('PDF generation');
    }

    case 'create_barcode': {
      throw new NotConfiguredError('Barcode generation');
    }

    case 'post_stock': {
      throw new NotConfiguredError('Stock posting');
    }

    case 'convert_to': {
      throw new NotConfiguredError('Document conversion');
    }

    case 'run_script': {
      throw new NotConfiguredError('Script sandbox not ready');
    }

    case 'call_api': {
      const url = action.config['url'] as string;
      const method = ((action.config['method'] as string) ?? 'GET').toUpperCase();
      const headers = (action.config['headers'] as Record<string, string>) ?? {};
      const bodyExpr = action.config['body'] as string | undefined;

      const resolvedUrl = exprEngine.evaluateSource(url, ctx) as string;
      await assertSsrfSafe(resolvedUrl);

      const resolvedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        resolvedHeaders[k] = String(exprEngine.evaluateSource(v, ctx));
      }

      const bodyStr = bodyExpr
        ? JSON.stringify(exprEngine.evaluateSource(bodyExpr, ctx))
        : undefined;

      const response = await fetch(resolvedUrl, {
        method,
        headers: resolvedHeaders,
        body: bodyStr,
      });
      const responseBody = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = responseBody;
      }
      ctx.vars['_apiResponse'] = parsed as ExprValue;
      return { status: response.status, body: parsed };
    }

    case 'start_approval': {
      const chainId = action.config['chainId'] as string;
      const recordIdExpr = action.config['recordId'] as string;
      const recordId = String(exprEngine.evaluateSource(recordIdExpr, ctx));

      await opts.pool.query(
        `INSERT INTO public.approval_requests
           (chain_id, record_id, tenant_slug, status, created_at)
         VALUES ($1, $2, $3, 'pending', now())
         ON CONFLICT DO NOTHING`,
        [chainId, recordId, opts.tenantSlug],
      );
      return { chainId, recordId };
    }

    case 'wait_delay': {
      const seconds = Math.min(Number(action.config['seconds'] ?? 0), 300);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return { waited: seconds };
    }

    // ── UI-side only (server: log and skip) ───────────────────────────────────

    case 'notify_user':
    case 'show_toast':
    case 'navigate': {
      // UI-side only; on the server we log and skip
      return { skipped: true, reason: 'ui-side-only' };
    }

    default: {
      const exhaustive: never = action.actionType;
      throw new Error(`Unknown action type: ${String(exhaustive)}`);
    }
  }
}

async function resolveTableDef(
  tableId: string,
  opts: RunnerOptions,
): Promise<TableDef> {
  if (opts.getTableDef) {
    const def = await opts.getTableDef(tableId);
    if (def) return def;
  }
  throw new Error(`TableDef not found: ${tableId}`);
}
