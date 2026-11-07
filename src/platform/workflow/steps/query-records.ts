<<<<<<< HEAD
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const tableApiKey = step.config["tableApiKey"] as string;
  const filter = step.config["filter"] as string | undefined;
  const filterParams = (step.config["filterParams"] as unknown[]) ?? [];
  const limit = Math.min(Number(step.config["limit"] ?? 1000), 5000);
  const outputVariable = (step.config["outputVariable"] as string) ?? "_queryResult";
  if (!tableApiKey) throw new Error("query_records: tableApiKey is required");
  const where = filter ? `WHERE ${filter}` : "";
  const result = await deps.pgPool.query(
    `SELECT * FROM "${ctx.tenantSlug}"."${tableApiKey}" ${where} LIMIT ${limit}`,
    filterParams,
  );
=======
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const tableApiKey = step.config['tableApiKey'] as string;
  const filter = step.config['filter'] as string | undefined;
  const filterParams = (step.config['filterParams'] as unknown[]) ?? [];
  const limit = Math.min(Number(step.config['limit'] ?? 1000), 5000);
  const outputVariable = (step.config['outputVariable'] as string) ?? '_queryResult';
  if (!tableApiKey) throw new Error('query_records: tableApiKey is required');
  const where = filter ? `WHERE ${filter}` : '';
  const result = await deps.pgPool.query(`SELECT * FROM "${ctx.tenantSlug}"."${tableApiKey}" ${where} LIMIT ${limit}`, filterParams);
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
  ctx.variables[outputVariable] = result.rows;
  return { output: result.rows, logs: [`Queried ${result.rows.length} rows from ${tableApiKey}`] };
}
