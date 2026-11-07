import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const tableApiKey = step.config['tableApiKey'] as string;
  const data = (step.config['data'] as Record<string, unknown>) ?? {};
  if (!tableApiKey) throw new Error('create_record: tableApiKey is required');
  const keys = Object.keys(data);
  if (keys.length === 0) throw new Error('create_record: data must have at least one field');
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const result = await deps.pgPool.query(`INSERT INTO "${ctx.tenantSlug}"."${tableApiKey}" (${cols}) VALUES (${placeholders}) RETURNING *`, keys.map((k) => data[k]));
  const created = result.rows[0] as Record<string, unknown>;
  ctx.variables['_created'] = created;
  return { output: created, logs: [`Inserted 1 row into ${tableApiKey}`] };
}
