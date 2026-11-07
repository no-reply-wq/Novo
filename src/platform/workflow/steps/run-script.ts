import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, ctx: WorkflowContext, _deps: WorkflowDeps): Promise<StepResult> {
  const code = step.config["code"] as string | undefined;
  const outputVariable = (step.config["outputVariable"] as string) ?? "_scriptResult";
  const input = (step.config["input"] as Record<string, unknown>) ?? {};
  if (!code && !step.config["scriptId"]) throw new Error("run_script: either code or scriptId is required");
  if (!code) throw new Error("run_script: scriptId lookup not yet implemented — provide inline code");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ivm = require("isolated-vm") as typeof import("isolated-vm");
  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  try {
    const context = await isolate.createContext();
    await context.global.set("global", context.global.derefInto());
    await context.eval(`var input = ${JSON.stringify({ ...input, ...ctx.variables })};`);
    const script = await isolate.compileScript(code);
    const raw = await script.run(context, { timeout: 5000 });
    const output = raw instanceof ivm.Reference ? await raw.copy() : raw;
    ctx.variables[outputVariable] = output as unknown;
    return { output, logs: ["Script executed successfully"] };
  } finally {
    isolate.dispose();
  }
}
