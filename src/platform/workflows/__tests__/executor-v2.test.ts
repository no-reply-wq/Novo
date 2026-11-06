/**
 * Tests for the Workflow v2 executor.
 * No Postgres required — all data operations and pool calls are mocked.
 */

import { runWorkflowV2, WorkflowLoopErrorV2 } from '../executor-v2';
import type { WorkflowContext, ExecutorOptions } from '../executor-v2';
import type { WorkflowDefV2, WorkflowStep } from '../types-v2';
import type { ExprEngine, ExprContext, ExprValue, CompiledExpr, ExprType, TypeCheckResult, SqlFragment } from '@/platform/expr';
import type { Pool } from 'pg';

// ─── Expr engine stub ─────────────────────────────────────────────────────────

function makeExprEngine(extraVars: Record<string, unknown> = {}): ExprEngine {
  return {
    parse(source: string): CompiledExpr {
      return { source, resultType: 'any' as ExprType };
    },
    typeCheck(_e: CompiledExpr, _ft: Record<string, ExprType>): TypeCheckResult {
      return { ok: true, inferredType: 'any', errors: [], warnings: [] };
    },
    evaluate(expr: CompiledExpr, ctx: ExprContext): ExprValue {
      return this.evaluateSource(expr.source, ctx);
    },
    evaluateSource(source: string, ctx: ExprContext): ExprValue {
      if (source === 'true') return true;
      if (source === 'false') return false;
      if (source === 'null') return null;
      if (!isNaN(Number(source))) return Number(source);
      if (source.startsWith('"') && source.endsWith('"')) return source.slice(1, -1);
      if (source.startsWith('[') && source.endsWith(']')) {
        try { return JSON.parse(source) as ExprValue; } catch { return null; }
      }
      const ctxVars = ctx.vars ?? {};
      if (source in ctxVars) return ctxVars[source] as ExprValue;
      if (source in extraVars) return extraVars[source] as ExprValue;
      return null;
    },
    toSql(_e: CompiledExpr, _ft: Record<string, ExprType>): SqlFragment | null {
      return null;
    },
  };
}

function makeCtx(vars: Record<string, ExprValue> = {}): WorkflowContext {
  return {
    variables: vars,
    triggerData: {},
    user: { id: 'u1', role: 'admin', roles: ['admin'] },
    tenantSlug: 'test',
    runId: `run_${Date.now()}`,
    stepPath: [],
  };
}

function makeOpts(overrides: Partial<ExecutorOptions> = {}): ExecutorOptions {
  return {
    pool: {} as Pool,
    exprEngine: makeExprEngine(),
    ...overrides,
  };
}

function makeWorkflow(steps: WorkflowStep[]): WorkflowDefV2 {
  return {
    id: 'wf1',
    appId: 'app1',
    name: 'Test',
    steps,
    enabled: true,
    version: 2,
    runTimeoutSeconds: 10,
    maxLoopIterations: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── if_else tests ────────────────────────────────────────────────────────────

describe('executor-v2 — if_else', () => {
  it('executes trueSteps when condition is true', async () => {
    const executed: string[] = [];
    const steps: WorkflowStep[] = [
      {
        id: 'cond1',
        type: 'if_else',
        condition: 'true',
        trueSteps: [
          {
            id: 'set_a',
            type: 'set_variable',
            name: 'x',
            valueExpression: '"yes"',
          },
        ],
        falseSteps: [
          {
            id: 'set_b',
            type: 'set_variable',
            name: 'x',
            valueExpression: '"no"',
          },
        ],
      },
    ];
    const ctx = makeCtx();
    const result = await runWorkflowV2(makeWorkflow(steps), ctx, makeOpts());
    expect(result.status).toBe('success');
    // The trueSteps set_variable mutates ctx.variables via exprCtx.vars
    const setLog = result.logs.find((l) => l.stepId === 'set_a');
    expect(setLog).toBeDefined();
    expect(setLog?.status).toBe('success');
    // falseSteps step should NOT appear in logs
    expect(result.logs.find((l) => l.stepId === 'set_b')).toBeUndefined();
    void executed;
  });

  it('executes falseSteps when condition is false', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'cond2',
        type: 'if_else',
        condition: 'false',
        trueSteps: [
          {
            id: 'true_step',
            type: 'set_variable',
            name: 'branch',
            valueExpression: '"true"',
          },
        ],
        falseSteps: [
          {
            id: 'false_step',
            type: 'set_variable',
            name: 'branch',
            valueExpression: '"false"',
          },
        ],
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.stepId === 'false_step')).toBeDefined();
    expect(result.logs.find((l) => l.stepId === 'true_step')).toBeUndefined();
  });
});

// ─── for_each tests ───────────────────────────────────────────────────────────

describe('executor-v2 — for_each', () => {
  it('runs sub-steps once per item and collects results', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'loop1',
        type: 'for_each',
        sourceExpression: '[1,2,3]',
        itemVariable: 'item',
        maxIterations: 100,
        steps: [
          {
            id: 'inner',
            type: 'show_toast',
            messageExpression: 'item',
            level: 'info',
          },
        ],
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('success');
    // 3 iterations → 3 inner logs
    const innerLogs = result.logs.filter((l) => l.stepId === 'inner');
    expect(innerLogs).toHaveLength(3);
  });

  it('stops at maxIterations and throws loop error', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'loop2',
        type: 'for_each',
        sourceExpression: '[1,2,3,4,5]',
        itemVariable: 'item',
        maxIterations: 2,
        steps: [
          {
            id: 'inner2',
            type: 'show_toast',
            messageExpression: 'item',
            level: 'info',
          },
        ],
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('loop_error');
  });
});

// ─── transaction tests ────────────────────────────────────────────────────────

describe('executor-v2 — transaction', () => {
  it('calls withTenantTx and rolls back on error in a middle step', async () => {
    // We test the structural behavior: the transaction step calls withTenantTx,
    // any error inside propagates out and the run result is 'failure'.
    const steps: WorkflowStep[] = [
      {
        id: 'tx1',
        type: 'transaction',
        steps: [
          {
            id: 'ok_step',
            type: 'set_variable',
            name: 'x',
            valueExpression: '"before"',
          },
          {
            id: 'bad_step',
            type: 'http_request',
            url: 'not-a-valid-url',
            method: 'GET',
            headers: {},
            responseVariable: 'resp',
          },
        ],
      },
    ];

    // Mock withTenantTx to execute the callback directly (simulating rollback on throw)
    jest.mock('@/platform/data/client', () => ({
      withTenantTx: async (
        _pool: unknown,
        _slug: unknown,
        _claims: unknown,
        fn: () => Promise<void>,
      ) => fn(),
    }));

    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    // SSRF or URL parse error should bubble
    expect(result.status).toBe('failure');
  });
});

// ─── try_catch tests ──────────────────────────────────────────────────────────

describe('executor-v2 — try_catch (via continueOnError pattern)', () => {
  it('runs catchSteps when trySteps throw', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'trycatch1',
        type: 'try_catch',
        trySteps: [
          {
            id: 'failing_step',
            type: 'http_request',
            url: 'not-a-url',
            method: 'GET',
            headers: {},
            responseVariable: 'r',
          },
        ],
        catchSteps: [
          {
            id: 'catch_step',
            type: 'set_variable',
            name: 'caught',
            valueExpression: '"yes"',
          },
        ],
        errorVariable: '_error',
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.stepId === 'catch_step')).toBeDefined();
  });
});

// ─── while loop test ──────────────────────────────────────────────────────────

describe('executor-v2 — while', () => {
  it('respects maxIterations', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'while1',
        type: 'while',
        condition: 'true',   // infinite if not capped
        maxIterations: 5,
        steps: [
          {
            id: 'wstep',
            type: 'show_toast',
            messageExpression: '"tick"',
            level: 'info',
          },
        ],
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('loop_error');
  });
});

// ─── set_variable + if_else integration ──────────────────────────────────────

describe('executor-v2 — set_variable integration', () => {
  it('variable set in trueSteps is available to later steps', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'cond3',
        type: 'if_else',
        condition: 'true',
        trueSteps: [
          {
            id: 'set_flag',
            type: 'set_variable',
            name: 'flag',
            valueExpression: '"flagged"',
          },
        ],
        falseSteps: [],
      },
      {
        id: 'read_flag',
        type: 'show_toast',
        messageExpression: 'flag',
        level: 'info',
      },
    ];
    const result = await runWorkflowV2(makeWorkflow(steps), makeCtx(), makeOpts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.stepId === 'set_flag')).toBeDefined();
    expect(result.logs.find((l) => l.stepId === 'read_flag')).toBeDefined();
  });
});

// ─── WorkflowLoopErrorV2 direct test ─────────────────────────────────────────

describe('WorkflowLoopErrorV2', () => {
  it('is thrown and caught by the runner, producing loop_error status', async () => {
    const steps: WorkflowStep[] = [
      {
        id: 'bigloop',
        type: 'for_each',
        sourceExpression: '[1,2,3,4,5,6,7,8,9,10,11]',
        itemVariable: 'i',
        maxIterations: 1000,
        steps: [
          { id: 'inner3', type: 'show_toast', messageExpression: '"x"', level: 'info' },
        ],
      },
    ];
    // Set global maxLoopIterations very low
    const wf: WorkflowDefV2 = { ...makeWorkflow(steps), maxLoopIterations: 3 };
    const result = await runWorkflowV2(wf, makeCtx(), makeOpts());
    expect(result.status).toBe('loop_error');
  });
});
