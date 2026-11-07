import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const tableApiKey = step.config["tableApiKey"] as string;
  const recordId = step.config["recordId"] as string | number;
  const data = (step.config["data"] as Record<string, unknown>) ?? {};
  const idColumn = (step.config["idColumn"] as string) ?? "id";
  if (!tableApiKey) throw new Error("update_record: tableApiKey is required");
  if (recordId == null) throw new Error("update_record: recordId is required");
  const keys = Object.keys(data);
  if (keys.length === 0) throw new Error("update_record: data must have at least one field");
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  const values = [...keys.map((k) => data[k]), recordId];
  const result = await deps.pgPool.query(
    `UPDATE "${ctx.tenantSlug}"."${tableApiKey}" SET ${setClauses} WHERE "${idColumn}" = $${keys.length + 1} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) throw new Error(`update_record: no row found with ${idColumn}=${String(recordId)}`);
  const updated = result.rows[0] as Record<string, unknown>;
  ctx.variables["_updated"] = updated;
  return { output: updated, logs: [`Updated row ${String(recordId)} in ${tableApiKey}`] };
}
