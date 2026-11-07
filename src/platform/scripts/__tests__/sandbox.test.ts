/**
 * Unit tests for the sandbox — basic functionality.
 * No real Postgres, no real HTTP.
 */

import { runScript, ScriptDef } from '../sandbox';
import { ScriptRunContext } from '../sandbox';
import { ScriptSdk } from '../sdk';

function makeScriptDef(code: string, overrides: Partial<ScriptDef> = {}): ScriptDef {
  return {
    id: 'test-script',
    appId: 'test-app',
    name: 'Test Script',
    language: 'javascript',
    code,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(input: Record<string, unknown> = {}): ScriptRunContext {
  return {
    tenantSlug: 'acme',
    userId: 'user-1',
    input,
    scriptId: 'test-script',
  };
}

function makeSdk(logsSpy: string[]): ScriptSdk {
  const returnBox = { value: undefined as unknown, set: false };
  return {
    db: {
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue({ id: 'new-id' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-id' }),
    },
    http: {
      get: jest.fn().mockResolvedValue({ status: 200, body: {} }),
      post: jest.fn().mockResolvedValue({ status: 200, body: {} }),
    },
    secrets: {
      get: jest.fn().mockResolvedValue('secret-value'),
    },
    log: {
      info: (...args: unknown[]) => { logsSpy.push(`[INFO] ${args.map(String).join(' ')}`); },
      warn: (...args: unknown[]) => { logsSpy.push(`[WARN] ${args.map(String).join(' ')}`); },
      error: (...args: unknown[]) => { logsSpy.push(`[ERROR] ${args.map(String).join(' ')}`); },
    },
    formatINR: (amount: number) => {
      const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
      const sign = amount < 0 ? '-' : '';
      let formatted: string;
      if (intPart.length <= 3) {
        formatted = intPart;
      } else {
        const last3 = intPart.slice(-3);
        const rest = intPart.slice(0, -3);
        const groups = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        formatted = `${groups},${last3}`;
      }
      return `${sign}₹${formatted}.${decPart}`;
    },
    amountInWords: () => 'One Lakh',
    return: (value: unknown) => {
      returnBox.value = value;
      returnBox.set = true;
    },
  };
}

describe('sandbox basic functionality', () => {
  it('script can access input and return a value', async () => {
    const logs: string[] = [];
    const sdk = makeSdk(logs);
    const scriptDef = makeScriptDef('return input.x + input.y;');
    const ctx = makeCtx({ x: 3, y: 4 });

    const result = await runScript(scriptDef, ctx, sdk);

    expect(result.output).toBe(7);
  });

  it('sdk.log.info messages are captured in result.logs', async () => {
    const logs: string[] = [];
    const sdk = makeSdk(logs);
    const scriptDef = makeScriptDef(`
      sdk.log.info('hello', 'world');
      sdk.log.warn('a warning');
      sdk.log.error('an error');
      return 'done';
    `);
    const ctx = makeCtx();

    const result = await runScript(scriptDef, ctx, sdk);

    expect(result.logs).toContain('[INFO] hello world');
    expect(result.logs).toContain('[WARN] a warning');
    expect(result.logs).toContain('[ERROR] an error');
    expect(result.output).toBe('done');
  });

  it('sdk.formatINR(123456.78) returns ₹1,23,456.78', async () => {
    const logs: string[] = [];
    const sdk = makeSdk(logs);
    const scriptDef = makeScriptDef('return sdk.formatINR(123456.78);');
    const ctx = makeCtx();

    const result = await runScript(scriptDef, ctx, sdk);

    expect(result.output).toBe('₹1,23,456.78');
  });

  it('result includes durationMs', async () => {
    const logs: string[] = [];
    const sdk = makeSdk(logs);
    const scriptDef = makeScriptDef('return 42;');
    const ctx = makeCtx();

    const result = await runScript(scriptDef, ctx, sdk);

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sdk.return() sets the output value', async () => {
    const logs: string[] = [];
    const sdk = makeSdk(logs);
    const scriptDef = makeScriptDef('sdk.return({ status: "ok" });');
    const ctx = makeCtx();

    const result = await runScript(scriptDef, ctx, sdk);

    expect(result.output).toEqual({ status: 'ok' });
  });
});
