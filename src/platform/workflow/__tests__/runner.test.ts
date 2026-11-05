/**
 * Unit tests for the workflow runner.
 * No Postgres required — all data operations are mocked.
 */

import { runWorkflow } from '../runner';
import type { WorkflowDef, ActionDef } from '@/platform/contracts/rules';
import type { ExprEngine, ExprContext, ExprValue, CompiledExpr, ExprType, TypeCheckResult, SqlFragment } from '@/platform/expr';

// ─── Minimal ExprEngine stub ──────────────────────────────────────────────────

function makeExprEngine(vars: Record<string, unknown> = {}): ExprEngine {
  return {
    parse(source: string): CompiledExpr {
      return { source, resultType: 'any' as ExprType };
    },
    typeCheck(_expr: CompiledExpr, _fieldTypes: Record<string, ExprType>): TypeCheckResult {
      return { ok: true, inferredType: 'any', errors: [], warnings: [] };
    },
    evaluate(_expr: CompiledExpr, ctx: ExprContext): ExprValue {
      return this.evaluateSource(_expr.source, ctx);
    },
    evaluateSource(source: string, ctx: ExprContext): ExprValue {
      // Simple literal or var lookup
      if (source === 'true') return true;
      if (source === 'false') return false;
      if (!isNaN(Number(source))) return Number(source);
      if (source.startsWith('"') && source.endsWith('"')) return source.slice(1, -1);
      if (source.startsWith('[') && source.endsWith(']')) {
        try { return JSON.parse(source) as ExprValue; } catch { return null; }
      }
      // Look up in vars
      const ctxVars = ctx.vars ?? {};
      if (source in ctxVars) return ctxVars[source] as ExprValue;
      if (source in vars) return vars[source] as ExprValue;
      return null;
    },
    toSql(_expr: CompiledExpr, _fieldTypes: Record<string, ExprType>): SqlFragment | null {
      return null;
    },
  };
}

function makeCtx(vars: Record<string, ExprValue> = {}): ExprContext {
  return {
    vars,
    user: { id: 'u1', email: 'test@test.com', roles: ['admin'], locations: [] },
  };
}

function makePool(): import('pg').Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
  } as unknown as import('pg').Pool;
}

function makeWorkflow(
  actions: Partial<ActionDef>[],
  overrides: Partial<WorkflowDef> = {},
): WorkflowDef {
  const now = new Date();
  return {
    id: 'wf-1',
    appId: 'app-1',
    name: 'Test',
    trigger: {
      id: 't1',
      workflowId: 'wf-1',
      event: 'button_clicked',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    actions: actions.map((a, i) => ({
      id: `a${i}`,
      workflowId: 'wf-1',
      rank: i,
      actionType: 'set_variable' as const,
      config: {},
      createdAt: now,
      updatedAt: now,
      ...a,
    })),
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runner — set_variable', () => {
  it('mutates context vars', async () => {
    const workflow = makeWorkflow([
      {
        id: 'a0',
        actionType: 'set_variable',
        config: { name: 'myVar', value: '42' },
      },
    ]);

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('success');
    expect(result.logs[0].status).toBe('success');
    expect(result.logs[0].output).toEqual({ myVar: 42 });
  });
});

describe('runner — if_else', () => {
  it('takes the then branch when condition is true', async () => {
    const now = new Date();
    const workflow: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'IfTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'if1', workflowId: 'wf-1', rank: 0, actionType: 'if_else', config: { condition: 'true' }, createdAt: now, updatedAt: now },
        { id: 'then1', workflowId: 'wf-1', rank: 0, parentId: 'if1', actionType: 'set_variable', config: { name: 'branch', value: '"then"', block: 'then' }, createdAt: now, updatedAt: now },
        { id: 'else1', workflowId: 'wf-1', rank: 1, parentId: 'if1', actionType: 'set_variable', config: { name: 'branch', value: '"else"', block: 'else' }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('success');
    // if_else logs the branch taken
    const ifLog = result.logs.find((l) => l.actionId === 'if1');
    expect(ifLog?.output).toMatchObject({ branch: 'then' });
  });

  it('takes the else branch when condition is false', async () => {
    const now = new Date();
    const workflow: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'IfTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'if1', workflowId: 'wf-1', rank: 0, actionType: 'if_else', config: { condition: 'false' }, createdAt: now, updatedAt: now },
        { id: 'then1', workflowId: 'wf-1', rank: 0, parentId: 'if1', actionType: 'set_variable', config: { name: 'branch', value: '"then"', block: 'then' }, createdAt: now, updatedAt: now },
        { id: 'else1', workflowId: 'wf-1', rank: 1, parentId: 'if1', actionType: 'set_variable', config: { name: 'branch', value: '"else"', block: 'else' }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('success');
    const ifLog = result.logs.find((l) => l.actionId === 'if1');
    expect(ifLog?.output).toMatchObject({ branch: 'else' });
  });
});

describe('runner — for_each', () => {
  it('iterates over an array correctly', async () => {
    const now = new Date();
    const workflow: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'ForEachTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'fe1', workflowId: 'wf-1', rank: 0, actionType: 'for_each', config: { items: '[1,2,3]', varName: 'item' }, createdAt: now, updatedAt: now },
        { id: 'sv1', workflowId: 'wf-1', rank: 0, parentId: 'fe1', actionType: 'set_variable', config: { name: 'lastItem', value: 'item' }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('success');
    const feLog = result.logs.find((l) => l.actionId === 'fe1');
    expect(feLog?.output).toMatchObject({ iterations: 3 });
  });

  it('throws WorkflowLoopError when maxLoopIterations exceeded', async () => {
    const now = new Date();
    // Build 101-item array
    const bigArray = JSON.stringify(Array.from({ length: 101 }, (_, i) => i));
    const workflow: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'LoopTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'fe1', workflowId: 'wf-1', rank: 0, actionType: 'for_each', config: { items: bigArray, varName: 'x' }, createdAt: now, updatedAt: now },
        { id: 'sv1', workflowId: 'wf-1', rank: 0, parentId: 'fe1', actionType: 'set_variable', config: { name: 'x2', value: 'x' }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      maxLoopIterations: 100,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('loop_error');
    expect(result.error).toMatch(/max loop/i);
  });
});

describe('runner — try_catch', () => {
  it('catches action errors and continues', async () => {
    const now = new Date();
    const workflow: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'TryCatchTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'tc1', workflowId: 'wf-1', rank: 0, actionType: 'try_catch', config: {}, createdAt: now, updatedAt: now },
        // try block: send_email always throws NotConfiguredError
        { id: 'try1', workflowId: 'wf-1', rank: 0, parentId: 'tc1', actionType: 'send_email', config: { block: 'try', to: '"a@b.com"', subject: '"Hi"', body: '"Hello"' }, createdAt: now, updatedAt: now },
        // catch block: sets a variable to signal the catch ran
        { id: 'catch1', workflowId: 'wf-1', rank: 1, parentId: 'tc1', actionType: 'set_variable', config: { name: 'caught', value: 'true', block: 'catch' }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const result = await runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    expect(result.status).toBe('success');
    const tcLog = result.logs.find((l) => l.actionId === 'tc1');
    expect(tcLog?.output).toMatchObject({ caught: expect.any(String) });
  });
});

describe('runner — timeout', () => {
  it('aborts after runTimeoutSeconds', async () => {
    jest.useFakeTimers();

    const now = new Date();
    const workflow: WorkflowDef = {
      id: 'wf-timeout',
      appId: 'app-1',
      name: 'TimeoutTest',
      trigger: { id: 't1', workflowId: 'wf-timeout', event: 'button_clicked', enabled: true, createdAt: now, updatedAt: now },
      actions: [
        { id: 'delay1', workflowId: 'wf-timeout', rank: 0, actionType: 'wait_delay', config: { seconds: 300 }, createdAt: now, updatedAt: now },
      ],
      enabled: true,
      version: 1,
      runTimeoutSeconds: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ctx = makeCtx();
    const promise = runWorkflow(workflow, {}, ctx, {
      pool: makePool(),
      tenantSlug: 'acme',
      exprEngine: makeExprEngine(),
    });

    // Advance timers past the timeout
    jest.advanceTimersByTime(2000);

    const result = await promise;
    expect(result.status).toBe('timeout');

    jest.useRealTimers();
    // Clear any pending timers to allow Jest to exit cleanly
    jest.clearAllTimers();
  });
});
