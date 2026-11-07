/**
 * Security / attack tests for the sandbox.
 *
 * Each test proves the sandbox blocks a specific attack vector.
 * These MUST pass against whatever sandbox implementation is active.
 */

import { runScript, ScriptDef } from '../sandbox';
import { ScriptRunContext } from '../sandbox';
import { ScriptSdk } from '../sdk';
import {
  SandboxSecurityError,
  SandboxTimeoutError,
  SsrfBlockedError,
} from '../errors';

function makeScriptDef(code: string, overrides: Partial<ScriptDef> = {}): ScriptDef {
  return {
    id: 'attack-script',
    appId: 'test-app',
    name: 'Attack Script',
    language: 'javascript',
    code,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(): ScriptRunContext {
  return {
    tenantSlug: 'acme',
    userId: 'user-1',
    input: {},
    scriptId: 'attack-script',
  };
}

/** Build a minimal SDK that delegates SSRF-sensitive http through the real sdk */
function makeSsrfSdk(): ScriptSdk {
  // Import real buildSdk for SSRF guard
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildSdk } = require('../sdk.js') as typeof import('../sdk.js');
  // We need a fake pool — SSRF check happens before any db call
  const fakePool = {} as import('pg').Pool;
  const logs: string[] = [];
  const returnBox = { value: undefined as unknown, set: false };
  return buildSdk({ pool: fakePool, tenantSlug: 'acme' }, logs, returnBox);
}

function makeNopSdk(): ScriptSdk {
  return {
    db: {
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    http: {
      get: jest.fn().mockResolvedValue({ status: 200, body: {} }),
      post: jest.fn().mockResolvedValue({ status: 200, body: {} }),
    },
    secrets: { get: jest.fn().mockResolvedValue('') },
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    formatINR: () => '₹0.00',
    amountInWords: () => 'Zero',
    return: jest.fn(),
  };
}

describe('sandbox security — attack tests', () => {
  it('blocks require()', async () => {
    await expect(
      runScript(makeScriptDef('return require("fs")'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow(SandboxSecurityError);
  });

  it('blocks process.env access', async () => {
    await expect(
      runScript(makeScriptDef('return process.env.DATABASE_URL'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });

  it('blocks __dirname / __filename', async () => {
    await expect(
      runScript(makeScriptDef('return __dirname'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });

  it('blocks __filename', async () => {
    await expect(
      runScript(makeScriptDef('return __filename'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });

  it('enforces CPU timeout', async () => {
    await expect(
      runScript(
        makeScriptDef('while(true){}', { timeoutMs: 100 }),
        makeCtx(),
        makeNopSdk(),
      ),
    ).rejects.toThrow(SandboxTimeoutError);
  }, 10_000);

  it('SSRF: blocks localhost', async () => {
    await expect(
      runScript(
        makeScriptDef('return sdk.http.get("http://localhost/secret")'),
        makeCtx(),
        makeSsrfSdk(),
      ),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('SSRF: blocks AWS metadata endpoint (169.254.169.254)', async () => {
    await expect(
      runScript(
        makeScriptDef('return sdk.http.get("http://169.254.169.254/latest/meta-data/")'),
        makeCtx(),
        makeSsrfSdk(),
      ),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('SSRF: blocks private IP 10.0.0.1', async () => {
    await expect(
      runScript(
        makeScriptDef('return sdk.http.get("http://10.0.0.1/")'),
        makeCtx(),
        makeSsrfSdk(),
      ),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('SSRF: blocks 192.168.x.x', async () => {
    await expect(
      runScript(
        makeScriptDef('return sdk.http.get("http://192.168.1.1/")'),
        makeCtx(),
        makeSsrfSdk(),
      ),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('SSRF: blocks 172.16.x.x (RFC 1918)', async () => {
    await expect(
      runScript(
        makeScriptDef('return sdk.http.get("http://172.16.0.1/")'),
        makeCtx(),
        makeSsrfSdk(),
      ),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('cross-tenant: db.query rejects queries referencing another tenant schema', async () => {
    // The acme tenant must not be able to access tenant_other schema
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildSdk } = require('../sdk.js') as typeof import('../sdk.js');
    const fakePool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      }),
    } as unknown as import('pg').Pool;
    const logs: string[] = [];
    const returnBox = { value: undefined as unknown, set: false };
    const realSdk = buildSdk({ pool: fakePool, tenantSlug: 'acme' }, logs, returnBox);

    await expect(
      realSdk.db.query('SELECT * FROM tenant_other.records'),
    ).rejects.toThrow(/Cross-tenant schema access denied/);
  });

  it('cross-tenant: db.query rejects queries referencing public schema tables', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildSdk } = require('../sdk.js') as typeof import('../sdk.js');
    const fakePool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      }),
    } as unknown as import('pg').Pool;
    const logs: string[] = [];
    const returnBox = { value: undefined as unknown, set: false };
    const realSdk = buildSdk({ pool: fakePool, tenantSlug: 'acme' }, logs, returnBox);

    await expect(
      realSdk.db.query('SELECT * FROM public.secret_table'),
    ).rejects.toThrow(/Cross-tenant schema access denied/);
  });

  it('blocks eval()', async () => {
    await expect(
      runScript(makeScriptDef('return eval("1+1")'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });

  it('blocks new Function() constructor', async () => {
    await expect(
      runScript(makeScriptDef('return new Function("return process")()'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });

  it('blocks dynamic import()', async () => {
    await expect(
      runScript(makeScriptDef('return import("fs")'), makeCtx(), makeNopSdk()),
    ).rejects.toThrow();
  });
});
