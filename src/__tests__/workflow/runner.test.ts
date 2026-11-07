/**
 * Spec runner tests (Agent F wave2) - if/else, loop-10, loop-protection-500, try/catch
 */
import { runWorkflow } from '@/platform/workflow/runner';
import type { WorkflowDef, ActionDef } from '@/platform/contracts/rules';
import type { ExprEngine, ExprContext, ExprValue, CompiledExpr, ExprType, TypeCheckResult, SqlFragment } from '@/platform/expr';

function makeExprEngine(): ExprEngine {
  return {
    parse(source: string): CompiledExpr { return { source, resultType: 'any' as ExprType }; },
    typeCheck(_e: CompiledExpr, _f: Record<string, ExprType>): TypeCheckResult { return { ok: true, inferredType: 'any', errors: [], warnings: [] }; },
    evaluate(_e: CompiledExpr, ctx: ExprContext): ExprValue { return this.evaluateSource(_e.source, ctx); },
    evaluateSource(source: string, ctx: ExprContext): ExprValue {
      if (source === 'true') return true;
      if (source === 'false') return false;
      if (!isNaN(Number(source))) return Number(source);
      if (source.startsWith('"') && source.endsWith('"')) return source.slice(1, -1);
      if (source.startsWith('[')) { try { return JSON.parse(source) as ExprValue; } catch { return null; } }
      const v = ctx.vars ?? {};
      return source in v ? v[source] as ExprValue : null;
    },
    toSql(_e: CompiledExpr, _f: Record<string, ExprType>): SqlFragment | null { return null; },
  };
}
function makeCtx(): ExprContext { return { vars: {}, user: { id: 'u1', email: 'test@test.com', roles: ['admin'], locations: [] } }; }
function makePool(): import('pg').Pool { return { query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }) } as unknown as import('pg').Pool; }
const NOW = new Date();
function action(overrides: Partial<ActionDef> & { id: string; actionType: ActionDef['actionType'] }): ActionDef { return { workflowId: 'wf-spec', rank: 0, config: {}, createdAt: NOW, updatedAt: NOW, ...overrides }; }
function wf(actions: ActionDef[], overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return { id: 'wf-spec', appId: 'app-1', name: 'T', trigger: { id: 't1', workflowId: 'wf-spec', event: 'button_clicked', enabled: true, createdAt: NOW, updatedAt: NOW }, actions, enabled: true, version: 1, createdAt: NOW, updatedAt: NOW, ...overrides };
}
const opts = () => ({ pool: makePool(), tenantSlug: 'acme', exprEngine: makeExprEngine() });

describe('Spec runner - if/else', () => {
  it('runs then-branch when condition is true', async () => {
    const workflow = wf([
      action({ id: 'if1', actionType: 'if_else', rank: 0, config: { condition: 'true' } }),
      action({ id: 'then1', actionType: 'set_variable', rank: 0, parentId: 'if1', config: { name: 'r', value: '"then"', block: 'then' } }),
      action({ id: 'else1', actionType: 'set_variable', rank: 1, parentId: 'if1', config: { name: 'r', value: '"else"', block: 'else' } }),
    ]);
    const result = await runWorkflow(workflow, {}, makeCtx(), opts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.actionId === 'if1')?.output).toMatchObject({ branch: 'then' });
  });
  it('runs else-branch when condition is false', async () => {
    const workflow = wf([
      action({ id: 'if1', actionType: 'if_else', rank: 0, config: { condition: 'false' } }),
      action({ id: 'then1', actionType: 'set_variable', rank: 0, parentId: 'if1', config: { name: 'r', value: '"then"', block: 'then' } }),
      action({ id: 'else1', actionType: 'set_variable', rank: 1, parentId: 'if1', config: { name: 'r', value: '"else"', block: 'else' } }),
    ]);
    const result = await runWorkflow(workflow, {}, makeCtx(), opts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.actionId === 'if1')?.output).toMatchObject({ branch: 'else' });
  });
});

describe('Spec runner - loop with 10 items', () => {
  it('iterates exactly 10 times', async () => {
    const items = JSON.stringify(Array.from({ length: 10 }, (_, i) => i + 1));
    const workflow = wf([
      action({ id: 'fe1', actionType: 'for_each', rank: 0, config: { items, varName: 'n' } }),
      action({ id: 'sv1', actionType: 'set_variable', rank: 0, parentId: 'fe1', config: { name: 'last', value: 'n' } }),
    ]);
    const result = await runWorkflow(workflow, {}, makeCtx(), opts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.actionId === 'fe1')?.output).toMatchObject({ iterations: 10 });
  });
});

describe('Spec runner - loop protection at 500 iterations', () => {
  it('returns loop_error when iterations exceed maxLoopIterations=500', async () => {
    const items = JSON.stringify(Array.from({ length: 501 }, (_, i) => i));
    const workflow = wf([
      action({ id: 'fe1', actionType: 'for_each', rank: 0, config: { items, varName: 'x' } }),
      action({ id: 'sv1', actionType: 'set_variable', rank: 0, parentId: 'fe1', config: { name: 'x2', value: 'x' } }),
    ], { maxLoopIterations: 500 });
    const result = await runWorkflow(workflow, {}, makeCtx(), opts());
    expect(result.status).toBe('loop_error');
    expect(result.error).toMatch(/max loop/i);
  });
});

describe('Spec runner - try/catch swallows errors', () => {
  it('catches a throwing step and continues', async () => {
    const workflow = wf([
      action({ id: 'tc1', actionType: 'try_catch', rank: 0, config: {} }),
      action({ id: 'try1', actionType: 'send_email', rank: 0, parentId: 'tc1', config: { block: 'try', to: '"a@b.com"', subject: '"Hi"', body: '"Hello"' } }),
      action({ id: 'catch1', actionType: 'set_variable', rank: 1, parentId: 'tc1', config: { name: 'caught', value: 'true', block: 'catch' } }),
    ]);
    const result = await runWorkflow(workflow, {}, makeCtx(), opts());
    expect(result.status).toBe('success');
    expect(result.logs.find((l) => l.actionId === 'tc1')?.output).toBeDefined();
  });
});
