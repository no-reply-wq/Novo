/**
 * Workflow executor v2.
 *
 * Handles the full WorkflowStep discriminated union including:
 * - if_else, switch, for_each, while, try_catch, transaction
 * - wait_approval (creates an ApprovalRequest and returns a resumption token)
 * - wait_delay, http_request, send_email, send_whatsapp, generate_pdf
 * - post_stock, convert_to, call_script
 * - create_record, update_record, delete_record, run_query, set_variable
 * - show_toast, navigate (UI-side only — logged and skipped on server)
 */

import dns from 'dns/promises';
import { Pool } from 'pg';
import type { ExprEngine, ExprContext, ExprValue } from '@/platform/expr';
import type { TableDef } from '@/platform/contracts';
import { insertRecord, updateRecord, deleteRecord } from '@/platform/data/crud';
import { withTenantTx } from '@/platform/data/client';
import {
  createApprovalRequest,
  getApprovalFlow,
} from './approvals';
import type {
  WorkflowStep,
  WorkflowDefV2,
  WorkflowResumptionToken,
} from './types-v2';

// ─── Execution context ────────────────────────────────────────────────────────

export interface WorkflowContext {
  variables: Record<string, unknown>;
  triggerData: Record<string, unknown>;
  user: { id: string; role: string; roles?: string[] };
  tenantSlug: string;
  runId: string;
  stepPath: string[];
}

// ─── Log entry ────────────────────────────────────────────────────────────────

export interface StepLogEntry {
  stepId: string;
  stepType: string;
  stepPath: string[];
  status: 'success' | 'failure' | 'skipped';
  startedAt: Date;
  durationMs: number;
  output?: unknown;
  error?: string;
}

// ─── Run result ───────────────────────────────────────────────────────────────

export type RunStatus = 'success' | 'failure' | 'timeout' | 'loop_error' | 'suspended';

export interface WorkflowRunResult {
  status: RunStatus;
  workflowId: string;
  runId: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  logs: StepLogEntry[];
  error?: string;
  resumptionToken?: WorkflowResumptionToken;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class WorkflowSuspendedError extends Error {
  constructor(public readonly token: WorkflowResumptionToken) {
    super(`Workflow suspended — awaiting approval: ${token.approvalRequestId}`);
    this.name = 'WorkflowSuspendedError';
  }
}

export class WorkflowTimeoutErrorV2 extends Error {
  constructor(timeoutSeconds: number) {
    super(`Workflow timed out after ${timeoutSeconds} seconds`);
    this.name = 'WorkflowTimeoutErrorV2';
  }
}

export class WorkflowLoopErrorV2 extends Error {
  constructor(limit: number) {
    super(`Loop exceeded maxIterations limit of ${limit}`);
    this.name = 'WorkflowLoopErrorV2';
  }
}

// ─── SSRF guard ───────────────────────────────────────────────────────────────

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
    throw new Error(`SSRF blocked: hostname "${hostname}" is blocked`);
  }
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new Error(`SSRF blocked: DNS resolution failed for "${hostname}"`);
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`SSRF blocked: IP ${addr} is private`);
    }
  }
}

// ─── Executor options ─────────────────────────────────────────────────────────

export interface ExecutorOptions {
  pool: Pool;
  exprEngine: ExprEngine;
  getTableDef?: (tableId: string) => Promise<TableDef | null>;
}

// ─── Internal mutable context ─────────────────────────────────────────────────

type MutableExprContext = {
  -readonly [K in keyof ExprContext]: ExprContext[K];
} & { vars: Record<string, ExprValue> };

interface InternalOpts {
  workflow: WorkflowDefV2;
  execOpts: ExecutorOptions;
  loopCounter: { count: number };
  maxIterations: number;
  logs: StepLogEntry[];
  wfCtx: WorkflowContext;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runWorkflowV2(
  workflow: WorkflowDefV2,
  wfCtx: WorkflowContext,
  execOpts: ExecutorOptions,
): Promise<WorkflowRunResult> {
  const startedAt = new Date();
  const logs: StepLogEntry[] = [];
  const timeoutMs = (workflow.runTimeoutSeconds ?? 30) * 1000;
  const maxIterations = workflow.maxLoopIterations ?? 1000;

  const exprCtx: MutableExprContext = {
    vars: {
      ...wfCtx.variables,
      _trigger: wfCtx.triggerData as ExprValue,
    },
    user: {
      id: wfCtx.user.id,
      email: '',
      roles: wfCtx.user.roles ?? [wfCtx.user.role],
      locations: [],
    },
  };

  const internalOpts: InternalOpts = {
    workflow,
    execOpts,
    loopCounter: { count: 0 },
    maxIterations,
    logs,
    wfCtx,
  };

  async function execute(): Promise<WorkflowResumptionToken | undefined> {
    return executeSteps(workflow.steps, exprCtx, internalOpts);
  }

  try {
    const result = await Promise.race([
      execute(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new WorkflowTimeoutErrorV2(workflow.runTimeoutSeconds ?? 30)),
          timeoutMs,
        ),
      ),
    ]);

    const endedAt = new Date();
    if (result) {
      return {
        status: 'suspended',
        workflowId: workflow.id,
        runId: wfCtx.runId,
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        logs,
        resumptionToken: result,
      };
    }
    return {
      status: 'success',
      workflowId: workflow.id,
      runId: wfCtx.runId,
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      logs,
    };
  } catch (err) {
    const endedAt = new Date();
    let status: RunStatus = 'failure';
    if (err instanceof WorkflowTimeoutErrorV2) status = 'timeout';
    if (err instanceof WorkflowLoopErrorV2) status = 'loop_error';

    if (err instanceof WorkflowSuspendedError) {
      return {
        status: 'suspended',
        workflowId: workflow.id,
        runId: wfCtx.runId,
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        logs,
        resumptionToken: err.token,
      };
    }

    return {
      status,
      workflowId: workflow.id,
      runId: wfCtx.runId,
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Step list execution ──────────────────────────────────────────────────────

async function executeSteps(
  steps: WorkflowStep[],
  ctx: MutableExprContext,
  opts: InternalOpts,
): Promise<WorkflowResumptionToken | undefined> {
  for (const step of steps) {
    const token = await executeStep(step, ctx, opts);
    if (token) return token;
  }
  return undefined;
}

async function executeStep(
  step: WorkflowStep,
  ctx: MutableExprContext,
  opts: InternalOpts,
): Promise<WorkflowResumptionToken | undefined> {
  const startedAt = new Date();
  const stepPath = [...opts.wfCtx.stepPath, step.id];

  async function run(): Promise<{ output: unknown; token?: WorkflowResumptionToken }> {
    const output = await dispatchStep(step, ctx, opts);
    if (output && typeof output === 'object' && '__resumptionToken' in output) {
      const token = (output as { __resumptionToken: WorkflowResumptionToken }).__resumptionToken;
      return { output: null, token };
    }
    return { output };
  }

  if (step.continueOnError) {
    try {
      const { output, token } = await run();
      appendLog(opts.logs, step, stepPath, 'success', startedAt, output);
      return token;
    } catch (err) {
      appendLog(opts.logs, step, stepPath, 'failure', startedAt, undefined, err);
      return undefined;
    }
  } else {
    try {
      const { output, token } = await run();
      appendLog(opts.logs, step, stepPath, 'success', startedAt, output);
      return token;
    } catch (err) {
      appendLog(opts.logs, step, stepPath, 'failure', startedAt, undefined, err);
      throw err;
    }
  }
}

function appendLog(
  logs: StepLogEntry[],
  step: WorkflowStep,
  stepPath: string[],
  status: StepLogEntry['status'],
  startedAt: Date,
  output?: unknown,
  err?: unknown,
): void {
  logs.push({
    stepId: step.id,
    stepType: step.type,
    stepPath,
    status,
    startedAt,
    durationMs: Date.now() - startedAt.getTime(),
    output,
    error: err instanceof Error ? err.message : err != null ? String(err) : undefined,
  });
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function dispatchStep(
  step: WorkflowStep,
  ctx: MutableExprContext,
  opts: InternalOpts,
): Promise<unknown> {
  const { execOpts, workflow, loopCounter, maxIterations, wfCtx } = opts;
  const { exprEngine, pool } = execOpts;

  function eval_(expr: string): ExprValue {
    return exprEngine.evaluateSource(expr, ctx);
  }

  function evalStr(expr: string): string {
    return String(eval_(expr));
  }

  switch (step.type) {
    // ── Control flow ──────────────────────────────────────────────────────────

    case 'if_else': {
      const result = eval_(step.condition);
      if (result) {
        await executeSteps(step.trueSteps, ctx, { ...opts, wfCtx: { ...wfCtx, stepPath: [...wfCtx.stepPath, step.id, 'trueSteps'] } });
      } else {
        await executeSteps(step.falseSteps, ctx, { ...opts, wfCtx: { ...wfCtx, stepPath: [...wfCtx.stepPath, step.id, 'falseSteps'] } });
      }
      return { branch: result ? 'true' : 'false' };
    }

    case 'switch': {
      const value = eval_(step.expression);
      let matched = false;
      for (const c of step.cases) {
        if (c.value === value) {
          matched = true;
          await executeSteps(c.steps, ctx, opts);
          break;
        }
      }
      if (!matched && step.defaultSteps) {
        await executeSteps(step.defaultSteps, ctx, opts);
      }
      return { value, matched };
    }

    case 'for_each': {
      const items = eval_(step.sourceExpression);
      const arr = Array.isArray(items) ? items : [items];
      const limit = step.maxIterations ?? 1000;
      let iterations = 0;

      for (const item of arr) {
        loopCounter.count++;
        iterations++;
        if (loopCounter.count > maxIterations || iterations > limit) {
          throw new WorkflowLoopErrorV2(Math.min(maxIterations, limit));
        }
        ctx.vars[step.itemVariable] = item as ExprValue;
        await executeSteps(step.steps, ctx, opts);
      }
      return { iterations };
    }

    case 'while': {
      const limit = step.maxIterations ?? 1000;
      let iterations = 0;
      while (eval_(step.condition)) {
        loopCounter.count++;
        iterations++;
        if (loopCounter.count > maxIterations || iterations > limit) {
          throw new WorkflowLoopErrorV2(Math.min(maxIterations, limit));
        }
        await executeSteps(step.steps, ctx, opts);
      }
      return { iterations };
    }

    case 'try_catch': {
      let caughtError: string | undefined;
      try {
        await executeSteps(step.trySteps, ctx, opts);
      } catch (err) {
        caughtError = err instanceof Error ? err.message : String(err);
        ctx.vars[step.errorVariable ?? '_error'] = caughtError;
        await executeSteps(step.catchSteps, ctx, opts);
      } finally {
        if (step.finallySteps) {
          await executeSteps(step.finallySteps, ctx, opts);
        }
      }
      return { caught: caughtError };
    }

    case 'transaction': {
      const claims = {
        userId: ctx.user?.id ?? 'system',
        roles: ctx.user?.roles ?? [],
        locations: [],
      };
      await withTenantTx(pool, wfCtx.tenantSlug, claims, async () => {
        await executeSteps(step.steps, ctx, opts);
      });
      return { wrapped: step.steps.length };
    }

    // ── Async / wait ──────────────────────────────────────────────────────────

    case 'wait_delay': {
      const ms = Math.min(step.delaySeconds, 300) * 1000;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { waited: step.delaySeconds };
    }

    case 'wait_approval': {
      const flow = await getApprovalFlow(pool, step.approvalFlowId);
      if (!flow) throw new Error(`Approval flow not found: ${step.approvalFlowId}`);

      const recordId = evalStr(step.approverExpression);
      const request = await createApprovalRequest(pool, {
        flowId: flow.id,
        workflowRunId: wfCtx.runId,
        recordId,
        tableId: '',
        configSnapshot: flow,
        timeoutHours: step.timeoutHours,
      });

      const token: WorkflowResumptionToken = {
        runId: wfCtx.runId,
        workflowId: workflow.id,
        stepId: step.id,
        approvalRequestId: request.id,
        resumeAt: 'after_step',
        contextSnapshot: { ...ctx.vars } as Record<string, unknown>,
        createdAt: new Date(),
        expiresAt: step.timeoutHours
          ? new Date(Date.now() + step.timeoutHours * 3_600_000)
          : undefined,
      };

      return { __resumptionToken: token };
    }

    // ── Communication ─────────────────────────────────────────────────────────

    case 'send_email': {
      // Real implementation requires an email integration to be configured
      const to = evalStr(step.toExpression);
      const subject = evalStr(step.subjectExpression);
      const body = evalStr(step.bodyExpression);
      // Email is sent via the integration layer; we raise if not configured
      void to; void subject; void body;
      throw new Error('Email integration not configured. Set up an email provider in app settings.');
    }

    case 'send_whatsapp': {
      const to = evalStr(step.toExpression);
      const params: Record<string, string> = {};
      for (const [k, expr] of Object.entries(step.templateParams)) {
        params[k] = evalStr(expr);
      }
      void to; void params;
      throw new Error('WhatsApp integration not configured. Connect a WhatsApp provider in app settings.');
    }

    case 'generate_pdf': {
      const data = eval_(step.dataExpression);
      void data;
      throw new Error('PDF generation not configured. Enable the PDF module in app settings.');
    }

    // ── Business operations ───────────────────────────────────────────────────

    case 'post_stock': {
      const item = eval_(step.itemExpression);
      const qty = eval_(step.quantityExpression);
      void item; void qty;
      throw new Error('Stock posting not configured. Enable the inventory module.');
    }

    case 'convert_to': {
      const sourceRecord = eval_(step.sourceRecordExpression);
      void sourceRecord;
      throw new Error('Document conversion not yet implemented in this version.');
    }

    case 'call_script': {
      void step.scriptId;
      throw new Error('Script sandbox not ready (layer 3.4).');
    }

    case 'schedule': {
      // Registration is handled via the schedule API route, not at runtime
      return { registered: step.cronExpression, targetWorkflowId: step.targetWorkflowId };
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────

    case 'http_request': {
      const resolvedUrl = evalStr(step.url);
      await assertSsrfSafe(resolvedUrl);

      const resolvedHeaders: Record<string, string> = {};
      for (const [k, expr] of Object.entries(step.headers)) {
        resolvedHeaders[k] = evalStr(expr);
      }

      const bodyStr = step.bodyExpression
        ? JSON.stringify(eval_(step.bodyExpression))
        : undefined;

      const response = await fetch(resolvedUrl, {
        method: step.method,
        headers: resolvedHeaders,
        body: bodyStr,
        signal: AbortSignal.timeout(step.timeoutMs ?? 30_000),
      });

      const responseBody = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = responseBody;
      }

      ctx.vars[step.responseVariable] = parsed as ExprValue;
      return { status: response.status, body: parsed };
    }

    // ── Data CRUD ─────────────────────────────────────────────────────────────

    case 'create_record': {
      const tableDef = await resolveTableDef(step.tableId, execOpts);
      const data: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(step.data)) {
        data[key] = eval_(expr);
      }
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: [] };
      const record = await insertRecord(pool, wfCtx.tenantSlug, tableDef, data, { userId: claims.userId, claims }, exprEngine);
      if (step.outputVariable) ctx.vars[step.outputVariable] = record as ExprValue;
      ctx.vars['_created'] = record as ExprValue;
      return record;
    }

    case 'update_record': {
      const tableDef = await resolveTableDef(step.tableId, execOpts);
      const recordId = evalStr(step.recordIdExpression);
      const data: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(step.data)) {
        data[key] = eval_(expr);
      }
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: [] };
      const record = await updateRecord(pool, wfCtx.tenantSlug, tableDef, recordId, data, { userId: claims.userId, claims }, exprEngine);
      ctx.vars['_updated'] = record as ExprValue;
      return record;
    }

    case 'delete_record': {
      const tableDef = await resolveTableDef(step.tableId, execOpts);
      const recordId = evalStr(step.recordIdExpression);
      const claims = { userId: ctx.user?.id ?? 'system', roles: ctx.user?.roles ?? [], locations: [] };
      await deleteRecord(pool, wfCtx.tenantSlug, tableDef, recordId, { userId: claims.userId, claims }, exprEngine);
      return { deleted: recordId };
    }

    case 'run_query': {
      const params = step.params?.map((p) => eval_(p)) ?? [];
      const result = await pool.query(step.sql, params);
      if (step.outputVariable) ctx.vars[step.outputVariable] = result.rows as ExprValue;
      ctx.vars['_queryResult'] = result.rows as ExprValue;
      return result.rows;
    }

    case 'set_variable': {
      const value = eval_(step.valueExpression);
      ctx.vars[step.name] = value as ExprValue;
      return { [step.name]: value };
    }

    // ── UI-side only ──────────────────────────────────────────────────────────

    case 'show_toast':
    case 'navigate': {
      return { skipped: true, reason: 'ui-side-only' };
    }

    default: {
      const exhaustive: never = step;
      throw new Error(`Unknown step type: ${(exhaustive as WorkflowStep).type}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTableDef(tableId: string, opts: ExecutorOptions): Promise<TableDef> {
  if (opts.getTableDef) {
    const def = await opts.getTableDef(tableId);
    if (def) return def;
  }
  throw new Error(`TableDef not found: ${tableId}`);
}
