// Server-side HTML renderer + client-side loader for CustomComponentDef

import type { CustomComponentDef } from "./types";

export interface ComponentSandbox {
  run(
    code: string,
    ctx: { tenantSlug: string; userId: string; input: Record<string, unknown>; scriptId: string },
  ): Promise<{ output: unknown; logs: string[] }>;
}

export async function renderCustomComponent(
  def: CustomComponentDef,
  props: Record<string, unknown>,
  sandbox: ComponentSandbox,
): Promise<string> {
  const wrappedCode = `
    const __props__ = ${JSON.stringify(props)};
    ${def.code}
    if (typeof module !== "undefined" && module.exports && typeof module.exports.default === "function") {
      sdk.return(String(module.exports.default(__props__)));
    }
  `;
  const ctx = { tenantSlug: def.appId, userId: "system", input: props, scriptId: def.id };
  const result = await sandbox.run(wrappedCode, ctx);
  if (typeof result.output === "string") return result.output;
  if (result.output != null) return String(result.output);
  return "";
}

/**
 * Build a ComponentSandbox backed by the platform sandbox runScript.
 */
export async function buildDefaultSandbox(
  pool: import("pg").Pool,
): Promise<ComponentSandbox> {
  const { runScript } = await import("../scripts/sandbox");
  return {
    async run(code, ctx) {
      const now = new Date();
      const scriptDef = {
        id: ctx.scriptId,
        appId: ctx.tenantSlug,
        name: "component-render",
        language: "javascript" as const,
        code,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const result = await runScript(scriptDef, ctx, pool);
      return { output: result.output, logs: result.logs };
    },
  };
}

/**
 * Client-side only: load a custom component from its ESM code string.
 */
export async function loadCustomComponent(def: CustomComponentDef): Promise<unknown> {
  if (typeof window === "undefined") {
    throw new Error("loadCustomComponent is a client-only function");
  }
  const blob = new Blob([def.code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* webpackIgnore: true */ url) as { default?: unknown };
    return mod.default ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
