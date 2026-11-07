<<<<<<< HEAD
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(
  step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps,
): Promise<StepResult & { branch: "then" | "else" }> {
  let condition = step.config["condition"];
  if (typeof condition === "string" && condition in ctx.variables) {
    condition = ctx.variables[condition];
  }
  const branch: "then" | "else" = Boolean(condition) ? "then" : "else";
  return {
    output: { branch, condition },
    logs: [`Condition evaluated to ${String(Boolean(condition))}; taking ${branch} branch`],
    branch,
  };
=======
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult & { branch: 'then' | 'else' }> {
  let condition = step.config['condition'];
  if (typeof condition === 'string' && condition in ctx.variables) condition = ctx.variables[condition];
  const branch: 'then' | 'else' = Boolean(condition) ? 'then' : 'else';
  return { output: { branch, condition }, logs: [`Condition evaluated to ${branch}`], branch };
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
}
