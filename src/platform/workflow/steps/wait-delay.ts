import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, _ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const seconds = Math.min(Number(step.config['seconds'] ?? 0), 300);
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
  return { output: { waited: seconds }, logs: [`Waited ${seconds}s`] };
}
