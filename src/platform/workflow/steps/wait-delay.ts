<<<<<<< HEAD
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, _ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const seconds = Math.min(Number(step.config["seconds"] ?? 0), 300);
=======
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, _ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const seconds = Math.min(Number(step.config['seconds'] ?? 0), 300);
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
  return { output: { waited: seconds }, logs: [`Waited ${seconds}s`] };
}
