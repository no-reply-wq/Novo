/**
 * Tests for src/platform/scripts/test-runner.ts
 */

import { runScriptTests } from '../../platform/scripts/test-runner';
import type { ScriptContext } from '../../platform/sdk/types';

const baseContext: Omit<ScriptContext, 'input'> = {
  trigger: 'manual',
  userId: 'user-1',
  tenantSlug: 'acme',
  appId: 'app-1',
};

describe('runScriptTests', () => {
  test('passes when output matches expectedOutput', async () => {
    const results = await runScriptTests(
      `return { ok: true };`,
      [{ name: 'basic pass', input: {}, expectedOutput: { ok: true } }],
      baseContext
    );

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  test('fails when output does not match', async () => {
    const results = await runScriptTests(
      `return { ok: false };`,
      [{ name: 'mismatch', input: {}, expectedOutput: { ok: true } }],
      baseContext
    );

    expect(results[0].passed).toBe(false);
    expect(results[0].error).toMatch(/mismatch/i);
  });

  test('expectError passes when script throws', async () => {
    const results = await runScriptTests(
      `throw new Error('boom');`,
      [{ name: 'error expected', input: {}, expectError: true }],
      baseContext
    );

    expect(results[0].passed).toBe(true);
  });

  test('expectError fails when script succeeds', async () => {
    const results = await runScriptTests(
      `return { fine: true };`,
      [{ name: 'expected error but succeeded', input: {}, expectError: true }],
      baseContext
    );

    expect(results[0].passed).toBe(false);
  });

  test('mockDb is passed to sdk.db.findMany', async () => {
    const results = await runScriptTests(
      `const rows = await novo.db.findMany('items'); return { count: rows.length };`,
      [{
        name: 'mock db rows',
        input: {},
        mockDb: { items: [{ id: '1' }, { id: '2' }] },
        expectedOutput: { count: 2 },
      }],
      baseContext
    );

    expect(results[0].passed).toBe(true);
  });

  test('input is available in script', async () => {
    const results = await runScriptTests(
      `return { received: input.value };`,
      [{ name: 'input forwarded', input: { value: 99 }, expectedOutput: { received: 99 } }],
      baseContext
    );

    expect(results[0].passed).toBe(true);
  });

  test('multiple test cases run independently', async () => {
    const results = await runScriptTests(
      `return { v: input.n * 2 };`,
      [
        { name: 'double 3', input: { n: 3 }, expectedOutput: { v: 6 } },
        { name: 'double 5', input: { n: 5 }, expectedOutput: { v: 10 } },
        { name: 'double 0', input: { n: 0 }, expectedOutput: { v: 0 } },
      ],
      baseContext
    );

    expect(results.every((r) => r.passed)).toBe(true);
  });

  test('logs are captured via novo.log', async () => {
    // We don't expose logs in results, but the script should not crash
    const results = await runScriptTests(
      `novo.log('hello test', { x: 1 }); return { done: true };`,
      [{ name: 'log test', input: {}, expectedOutput: { done: true } }],
      baseContext
    );

    expect(results[0].passed).toBe(true);
  });
});
