/**
 * Script test runner — runs named test cases against a script using a mocked
 * NovoSDK so no real database or external calls are made.
 */

import type { ScriptContext, NovoSDK } from '../sdk/types';

export interface ScriptTestCase {
  name: string;
  input: Record<string, unknown>;
  /** Per-table mock data: table name -> array of rows. */
  mockDb?: Record<string, unknown[]>;
  expectedOutput?: unknown;
  expectError?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

// --- Mock SDK builder -----------------------------------------------------

function buildMockSdk(
  mockDb: Record<string, unknown[]>,
  secrets: Record<string, string>,
  logs: string[]
): NovoSDK {
  return {
    db: {
      query: async <T = Record<string, unknown>>(sql: string, _params?: unknown[]): Promise<T[]> => {
        // Very simple: return all rows from the first table name found in the SQL
        const match = sql.match(/FROM\s+"?(\w+)"?/i);
        const table = match?.[1];
        const rows = table ? (mockDb[table] ?? []) : [];
        return rows as T[];
      },

      insert: async (table, record) => {
        const row = { id: `mock-${Date.now()}`, ...record };
        if (!mockDb[table]) mockDb[table] = [];
        mockDb[table].push(row);
        return row;
      },

      update: async (table, id, patch) => {
        if (mockDb[table]) {
          const idx = mockDb[table].findIndex(
            (r) => (r as Record<string, unknown>).id === id
          );
          if (idx !== -1) {
            mockDb[table][idx] = { ...(mockDb[table][idx] as object), ...patch };
          }
        }
      },

      delete: async (table, id) => {
        if (mockDb[table]) {
          mockDb[table] = mockDb[table].filter(
            (r) => (r as Record<string, unknown>).id !== id
          );
        }
      },

      findById: async (table, id) => {
        const rows = mockDb[table] ?? [];
        return (rows.find((r) => (r as Record<string, unknown>).id === id) as Record<string, unknown>) ?? null;
      },

      findMany: async (table, filter, opts) => {
        let rows = [...(mockDb[table] ?? [])] as Record<string, unknown>[];
        if (filter) {
          rows = rows.filter((r) =>
            Object.entries(filter).every(([k, v]) => r[k] === v)
          );
        }
        const offset = opts?.offset ?? 0;
        const limit = opts?.limit ?? rows.length;
        return rows.slice(offset, offset + limit);
      },
    },

    http: {
      get: async () => ({ status: 200, body: { mock: true } }),
      post: async () => ({ status: 200, body: { mock: true } }),
    },

    email: {
      send: async (to, subject) => {
        logs.push(`[mock-email] To:${to} Subject:${subject}`);
      },
    },

    whatsapp: {
      send: async (to, message) => {
        logs.push(`[mock-whatsapp] To:${to} Message:${message}`);
      },
    },

    log: (message, data) => {
      logs.push(data !== undefined ? `${message} ${JSON.stringify(data)}` : message);
    },

    env: (key) => secrets[key],
  };
}

// --- Fallback function-constructor runner (no isolated-vm dependency) -----

async function runInFunction(
  code: string,
  input: Record<string, unknown>,
  sdk: NovoSDK,
  timeoutMs: number
): Promise<unknown> {
  const blockedGlobals = [
    'require', 'process', '__dirname', '__filename', 'module', 'exports',
    'global', 'globalThis', 'eval', 'Function', 'Buffer',
  ];

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Script timed out')), timeoutMs)
  );

  const runPromise = (async () => {
    // Wrap in async function so `await` and `return` work at top level of user code
    const wrappedCode = `return (async function __script__() {\n${code}\n})();`;
    const args = [...blockedGlobals, 'input', 'novo', wrappedCode];
    // eslint-disable-next-line no-new-func
    const fn = new Function(...args) as (...a: unknown[]) => Promise<unknown>;
    const undefineds = blockedGlobals.map(() => undefined);
    return fn(...undefineds, input, sdk);
  })();

  return Promise.race([runPromise, timeoutPromise]);
}

// --- Public API -----------------------------------------------------------

/**
 * Run all test cases for a script with mocked SDK (no real DB).
 *
 * @param code       - Raw JavaScript source of the script
 * @param testCases  - Array of test cases to execute
 * @param context    - Base context (input is overridden per test case)
 * @param timeoutMs  - Per-test timeout in ms (default 5 000)
 */
export async function runScriptTests(
  code: string,
  testCases: ScriptTestCase[],
  context: Omit<ScriptContext, 'input'>,
  timeoutMs = 5_000
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const tc of testCases) {
    const start = Date.now();
    const logs: string[] = [];
    // Clone mockDb so mutations in one test don't bleed into the next
    const mockDb = tc.mockDb
      ? Object.fromEntries(
          Object.entries(tc.mockDb).map(([t, rows]) => [t, [...rows]])
        )
      : {};

    const sdk = buildMockSdk(mockDb, {}, logs);

    try {
      const output = await runInFunction(code, tc.input, sdk, timeoutMs);

      if (tc.expectError) {
        results.push({
          name: tc.name,
          passed: false,
          error: 'Expected an error but script completed successfully',
          durationMs: Date.now() - start,
        });
        continue;
      }

      if (tc.expectedOutput !== undefined) {
        const matches =
          JSON.stringify(output) === JSON.stringify(tc.expectedOutput);
        results.push({
          name: tc.name,
          passed: matches,
          error: matches
            ? undefined
            : `Output mismatch: expected ${JSON.stringify(tc.expectedOutput)}, got ${JSON.stringify(output)}`,
          durationMs: Date.now() - start,
        });
      } else {
        results.push({ name: tc.name, passed: true, durationMs: Date.now() - start });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (tc.expectError) {
        results.push({ name: tc.name, passed: true, durationMs: Date.now() - start });
      } else {
        results.push({
          name: tc.name,
          passed: false,
          error: message,
          durationMs: Date.now() - start,
        });
      }
    }
  }

  return results;
}
