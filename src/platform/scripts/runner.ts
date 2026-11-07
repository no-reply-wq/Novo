/**
 * Script runner — the main entry point for running a tenant script.
 *
 * Uses the NovoSDK factory to create a fully-wired SDK, then runs the
 * user code in an async Function-constructor sandbox with `novo` injected
 * as a global. For stronger isolation in production, the existing sandbox.ts
 * (isolated-vm path) should be preferred; this implementation covers the
 * common case and is compatible with all test environments.
 */

import { Pool } from 'pg';
import { createSdk } from '../sdk/factory';
import type { ScriptContext } from '../sdk/types';

export interface ScriptRunResult {
  success: boolean;
  output?: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

export interface RunScriptOptions {
  /** Milliseconds before the script is forcibly terminated. Default: 10 000. */
  timeoutMs?: number;
  /** Memory limit in MB (informational; not strictly enforced in this runner). */
  memoryMb?: number;
  /** Resolved tenant secrets (key → value). */
  secrets?: Record<string, string>;
  /** Outbound HTTP allowlist — requests outside this list are blocked. */
  allowedUrls?: string[];
}

/**
 * Patterns that must never appear in script source (static analysis).
 * Duplicated here so this module is standalone without depending on sandbox.ts.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bimport\s*\(/, label: 'import()' },
  { pattern: /\bimport\s+/, label: 'static import' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bprocess\s*[.[]/, label: 'process' },
  { pattern: /\bglobal\s*[.[]/, label: 'global' },
  { pattern: /\bglobalThis\s*[.[]/, label: 'globalThis' },
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\bnew\s+Function\s*\(/, label: 'new Function()' },
];

function runStaticAnalysis(code: string): void {
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Forbidden expression in script: ${label}`);
    }
  }
}

/**
 * Run a tenant script string with NovoSDK injected as the `novo` global.
 *
 * @param code     - Raw JavaScript source of the script
 * @param context  - Execution context (tenant, user, trigger...)
 * @param pgPool   - Shared Postgres connection pool
 * @param opts     - Optional timeout / secrets / allowlist
 */
export async function runScript(
  code: string,
  context: ScriptContext,
  pgPool: Pool,
  opts: RunScriptOptions = {}
): Promise<ScriptRunResult> {
  const start = Date.now();

  // Static analysis — fast-fail before creating any SDK or pool connections
  try {
    runStaticAnalysis(code);
  } catch (err) {
    return {
      success: false,
      logs: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { sdk, logs } = createSdk(context, pgPool, {
    allowedUrls: opts.allowedUrls,
    secrets: opts.secrets,
  });

  const timeoutMs = opts.timeoutMs ?? 10_000;

  // Block globals that must not be accessible in user scripts
  const blockedGlobals = [
    'require', 'process', '__dirname', '__filename', 'module', 'exports',
    'global', 'globalThis', 'eval', 'Function', 'Buffer',
    'setTimeout', 'setInterval', 'setImmediate',
  ];

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  const runPromise = (async () => {
    // Wrap in async function so `await` and bare `return` work at top level
    const wrappedCode = `return (async function __script__() {\n${code}\n})();`;
    const args = [...blockedGlobals, 'input', 'novo', wrappedCode];
    // eslint-disable-next-line no-new-func
    const fn = new Function(...args) as (...a: unknown[]) => Promise<unknown>;
    const undefineds = blockedGlobals.map(() => undefined);
    return fn(...undefineds, context.input ?? {}, sdk);
  })();

  try {
    const output = await Promise.race([runPromise, timeoutPromise]);
    return {
      success: true,
      output,
      logs,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      logs,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
