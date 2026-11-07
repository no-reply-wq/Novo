import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const name = step.config['name'] as string;
  const value = step.config['value'];
  if (!name) throw new Error('set_variable: name is required');
  ctx.variables[name] = value;
  return { output: { [name]: value }, logs: [`Set variable "${name}"`] };
}
