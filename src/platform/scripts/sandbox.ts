/**
 * Tenant script sandbox.
 *
 * Uses isolated-vm for strong isolation. If isolated-vm is unavailable (native
 * module build failure), falls back to a strict Function-constructor sandbox
 * with an explicit allowlist.
 *
 * TODO: The fallback Function-constructor sandbox provides weaker isolation
 * than isolated-vm. In production, isolated-vm MUST be available. This fallback
 * is ONLY for environments where native modules cannot be built.
 */

import { Pool } from 'pg';
import { ScriptDef as BaseScriptDef } from '../contracts/rules';
import {
  SandboxError,
  SandboxMemoryError,
  SandboxSecurityError,
  SandboxTimeoutError,
  SsrfBlockedError,
} from './errors';
import { ScriptSdk, SdkDeps, buildSdk } from './sdk';

export type { ScriptSdk };

/** Extended ScriptDef with sandbox runtime constraints. */
export interface ScriptDef extends BaseScriptDef {
  /** Max CPU time in ms. Default 5000, max 30000. */
  timeoutMs?: number;
}

export interface ScriptRunContext {
  tenantSlug: string;
  userId: string;
  input: Record<string, unknown>;
  scriptId: string;
}

export interface ScriptRunResult {
  output: unknown;
  logs: string[];
  durationMs: number;
  memoryUsedBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MEMORY_LIMIT_MB = 64;

// ─── Static analysis — catch obvious violations before execution ──────────────

/** Patterns that must never appear in script source. */
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

function staticAnalysis(code: string): void {
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new SandboxSecurityError(`Forbidden expression in script: ${label}`);
    }
  }
}

// ─── Error serialization across the ivm boundary ─────────────────────────────

interface SerializedError {
  type: 'SsrfBlockedError' | 'SandboxSecurityError' | 'SandboxError' | 'Error';
  message: string;
}

function deserializeError(serialized: SerializedError): Error {
  switch (serialized.type) {
    case 'SsrfBlockedError': return new SsrfBlockedError(serialized.message.replace('SSRF blocked: ', ''));
    case 'SandboxSecurityError': return new SandboxSecurityError(serialized.message);
    default: return new SandboxError(serialized.message);
  }
}

// ─── isolated-vm sandbox ──────────────────────────────────────────────────────

async function runWithIsolatedVm(
  scriptDef: ScriptDef,
  ctx: ScriptRunContext,
  sdk: ScriptSdk,
  logs: string[],
  returnBox: { value: unknown; set: boolean },
  timeoutMs: number,
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ivm = require('isolated-vm') as typeof import('isolated-vm');

  // Shared error channel: async sdk calls serialize errors back via this ref
  let pendingError: Error | null = null;

  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
  const context = await isolate.createContext();
  const jail = context.global;

  await jail.set('global', jail.derefInto());
  await jail.set('__input__', new ivm.ExternalCopy(ctx.input).copyInto());

  // Error channel — called when an async ref throws
  await jail.set('__reportError__', new ivm.Reference((serialized: SerializedError) => {
    pendingError = deserializeError(serialized);
  }));

  // log
  await jail.set('__log_info__', new ivm.Reference((...args: unknown[]) => {
    logs.push(`[INFO] ${args.map(String).join(' ')}`);
  }));
  await jail.set('__log_warn__', new ivm.Reference((...args: unknown[]) => {
    logs.push(`[WARN] ${args.map(String).join(' ')}`);
  }));
  await jail.set('__log_error__', new ivm.Reference((...args: unknown[]) => {
    logs.push(`[ERROR] ${args.map(String).join(' ')}`);
  }));

  // Wrap an async sdk call: on success returns ExternalCopy, on failure stores pendingError and returns null
  async function safeAsyncRef<T>(fn: () => Promise<T>): Promise<unknown> {
    try {
      const result = await fn();
      return new ivm.ExternalCopy(result as Parameters<InstanceType<typeof ivm.ExternalCopy>['copy']>[0]).copyInto();
    } catch (err) {
      pendingError = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }

  // db
  await jail.set('__db_query__', new ivm.Reference(async (sql: string, params: unknown[]) =>
    safeAsyncRef(() => sdk.db.query(sql, params)),
  ));
  await jail.set('__db_insert__', new ivm.Reference(async (tableApiKey: string, data: Record<string, unknown>) =>
    safeAsyncRef(() => sdk.db.insert(tableApiKey, data)),
  ));
  await jail.set('__db_update__', new ivm.Reference(async (tableApiKey: string, id: string, data: Record<string, unknown>) =>
    safeAsyncRef(() => sdk.db.update(tableApiKey, id, data)),
  ));

  // http — SSRF errors propagate via pendingError
  await jail.set('__http_get__', new ivm.Reference(async (url: string, headers: Record<string, string>) =>
    safeAsyncRef(() => sdk.http.get(url, headers)),
  ));
  await jail.set('__http_post__', new ivm.Reference(async (url: string, body: unknown, headers: Record<string, string>) =>
    safeAsyncRef(() => sdk.http.post(url, body, headers)),
  ));

  // secrets
  await jail.set('__secrets_get__', new ivm.Reference(async (name: string) =>
    safeAsyncRef(() => sdk.secrets.get(name)),
  ));

  // sync utils
  await jail.set('__formatINR__', new ivm.Reference((amount: number) => sdk.formatINR(amount)));
  await jail.set('__amountInWords__', new ivm.Reference((amount: number) => sdk.amountInWords(amount)));

  // return box — value arrives as an already-copied primitive or object
  await jail.set('__return__', new ivm.Reference((value: unknown) => {
    // The value has already been copied by the caller (copy: true in applySync options)
    returnBox.value = value;
    returnBox.set = true;
  }));

  // Check after every async call if an error was stored
  const bootstrap = `
    const input = __input__;

    function __checkError__() {
      // No-op inside isolate — errors are checked in host after script.run()
    }

    const sdk = {
      db: {
        query: async (sql, params) => {
          const r = await __db_query__.apply(undefined, [sql, params ?? []], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
        insert: async (tableApiKey, data) => {
          const r = await __db_insert__.apply(undefined, [tableApiKey, data], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
        update: async (tableApiKey, id, data) => {
          const r = await __db_update__.apply(undefined, [tableApiKey, id, data], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
      },
      http: {
        get: async (url, headers) => {
          const r = await __http_get__.apply(undefined, [url, headers ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
        post: async (url, body, headers) => {
          const r = await __http_post__.apply(undefined, [url, body, headers ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
      },
      secrets: {
        get: async (name) => {
          const r = await __secrets_get__.apply(undefined, [name], { arguments: { copy: true }, result: { promise: true, copy: true } });
          return r;
        },
      },
      log: {
        info: (...args) => __log_info__.applySync(undefined, args),
        warn: (...args) => __log_warn__.applySync(undefined, args),
        error: (...args) => __log_error__.applySync(undefined, args),
      },
      formatINR: (amount) => __formatINR__.applySync(undefined, [amount], { result: { copy: true } }),
      amountInWords: (amount) => __amountInWords__.applySync(undefined, [amount], { result: { copy: true } }),
      return: (value) => __return__.applySync(undefined, [value], { arguments: { copy: true } }),
    };
  `;

  const userCode = `
    ${bootstrap}
    (async function() {
      "use strict";
      ${scriptDef.code}
    })();
  `;

  try {
    const script = await isolate.compileScript(userCode);
    const rawResult = await script.run(context, { timeout: timeoutMs, promise: true });

    // Check if any async sdk call stored an error
    if (pendingError !== null) {
      throw pendingError;
    }

    return returnBox.set ? returnBox.value : rawResult;
  } catch (err) {
    // If we have a pending error, it has priority
    if (pendingError !== null) throw pendingError;

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Script execution timed out') || msg.includes('execution timed out')) {
      throw new SandboxTimeoutError(timeoutMs);
    }
    if (msg.includes('Isolate was disposed') || msg.includes('memory limit')) {
      throw new SandboxMemoryError(MEMORY_LIMIT_MB);
    }
    if (err instanceof SandboxError) throw err;
    throw err;
  } finally {
    isolate.dispose();
  }
}

// ─── Fallback: strict Function-constructor sandbox ────────────────────────────
// TODO: This fallback provides weaker isolation than isolated-vm.
// In production, isolated-vm MUST be available. This fallback is ONLY for
// environments where native modules cannot be built.

type StrictSdk = {
  db: { query: unknown; insert: unknown; update: unknown };
  http: { get: unknown; post: unknown };
  secrets: { get: unknown };
  log: { info: unknown; warn: unknown; error: unknown };
  formatINR: unknown;
  amountInWords: unknown;
  return: unknown;
};

async function runWithFunctionConstructor(
  scriptDef: ScriptDef,
  ctx: ScriptRunContext,
  sdk: ScriptSdk,
  timeoutMs: number,
): Promise<unknown> {
  const blockedGlobals = [
    'require', 'process', '__dirname', '__filename', 'module', 'exports',
    'global', 'globalThis', 'eval', 'Function', 'Buffer',
    'setTimeout', 'setInterval', 'setImmediate',
  ];

  const safeSdk: StrictSdk = {
    db: {
      query: (sql: string, params?: unknown[]) => sdk.db.query(sql, params),
      insert: (tableApiKey: string, data: Record<string, unknown>) => sdk.db.insert(tableApiKey, data),
      update: (tableApiKey: string, id: string, data: Record<string, unknown>) => sdk.db.update(tableApiKey, id, data),
    },
    http: {
      get: (url: string, headers?: Record<string, string>) => sdk.http.get(url, headers),
      post: (url: string, body: unknown, headers?: Record<string, string>) => sdk.http.post(url, body, headers),
    },
    secrets: { get: (name: string) => sdk.secrets.get(name) },
    log: {
      info: (...args: unknown[]) => sdk.log.info(...args),
      warn: (...args: unknown[]) => sdk.log.warn(...args),
      error: (...args: unknown[]) => sdk.log.error(...args),
    },
    formatINR: sdk.formatINR,
    amountInWords: sdk.amountInWords,
    return: sdk.return.bind(sdk),
  };

  const args = [...blockedGlobals, 'input', 'sdk', scriptDef.code];
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new SandboxTimeoutError(timeoutMs)), timeoutMs);
  });

  const runPromise = (async () => {
    const fn = new Function(...args) as (...a: unknown[]) => unknown;
    const undefineds = blockedGlobals.map(() => undefined);
    return fn(...undefineds, ctx.input, safeSdk);
  })();

  return Promise.race([runPromise, timeoutPromise]);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

let ivmAvailable: boolean | null = null;

function checkIvmAvailable(): boolean {
  if (ivmAvailable !== null) return ivmAvailable;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ivm = require('isolated-vm') as typeof import('isolated-vm');
    // ABI smoke-test: actually create an Isolate to verify the native module
    // is ABI-compatible with the running Node version. A module compiled for a
    // different Node ABI loads without error but throws on first use.
    const probe = new ivm.Isolate({ memoryLimit: 8 });
    probe.dispose();
    ivmAvailable = true;
  } catch (err) {
    console.warn(
      '[sandbox] isolated-vm unavailable (native ABI mismatch or missing build); ' +
      'falling back to Function-constructor sandbox. ' +
      `Reason: ${err instanceof Error ? err.message : String(err)}`,
    );
    ivmAvailable = false;
  }
  return ivmAvailable;
}

export async function runScript(
  scriptDef: ScriptDef,
  ctx: ScriptRunContext,
  sdkOrPool: ScriptSdk | Pool,
): Promise<ScriptRunResult> {
  const timeoutMs = Math.min(
    scriptDef.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );

  // Static analysis — fast-fail before creating an isolate
  staticAnalysis(scriptDef.code);

  const logs: string[] = [];
  const returnBox: { value: unknown; set: boolean } = { value: undefined, set: false };

  let sdk: ScriptSdk;
  if (sdkOrPool instanceof Pool) {
    const deps: SdkDeps = { pool: sdkOrPool, tenantSlug: ctx.tenantSlug };
    sdk = buildSdk(deps, logs, returnBox);
  } else {
    sdk = sdkOrPool;
  }

  const start = Date.now();

  if (checkIvmAvailable()) {
    const output = await runWithIsolatedVm(scriptDef, ctx, sdk, logs, returnBox, timeoutMs);
    return { output, logs, durationMs: Date.now() - start };
  }

  // Fail CLOSED in production: the Function-constructor path does not provide
  // real isolation, so if the secure isolate is unavailable we refuse to run
  // tenant code rather than execute it with weak isolation.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Script execution is unavailable: the secure sandbox (isolated-vm) is not installed on this server.',
    );
  }

  const output = await runWithFunctionConstructor(scriptDef, ctx, sdk, timeoutMs);
  const finalOutput = returnBox.set ? returnBox.value : output;
  return { output: finalOutput, logs, durationMs: Date.now() - start };
}
