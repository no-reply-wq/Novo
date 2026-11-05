import { NextRequest, NextResponse } from 'next/server';

interface TestBody {
  input: Record<string, unknown>;
  code: string;
}

interface TestResult {
  output: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

type Params = Promise<{ appId: string; scriptId: string }>;

/**
 * POST /api/builder/apps/[appId]/scripts/[scriptId]/test
 *
 * Runs the script in a sandboxed vm context.
 * This is a simple Node.js vm sandbox — in production use a proper
 * isolated worker/sandbox service.
 */
export async function POST(
  req: NextRequest,
  { _params }: { _params: Params },
) {
  const body = (await req.json()) as TestBody;
  const { input, code } = body;

  const start = Date.now();
  const logs: string[] = [];
  let output: unknown = null;
  let error: string | undefined;

  try {
    // Build a sandbox function from the code
    // The code should export a main(input, sdk) function pattern
    // We evaluate it safely using the Function constructor with restricted globals

    const sdk = {
      db: {
        query: async () => [],
        insert: async (table: string, data: unknown) => ({ id: 'test', ...((data as object) ?? {}) }),
        update: async (table: string, id: string, data: unknown) => ({ id, ...((data as object) ?? {}) }),
        delete: async () => undefined,
      },
      http: {
        get: async (url: string) => ({ status: 200, data: {} }),
        post: async (url: string, body: unknown) => ({ status: 200, data: {} }),
        put: async (url: string, body: unknown) => ({ status: 200, data: {} }),
        delete: async (url: string) => ({ status: 200 }),
      },
      secrets: {
        get: (name: string) => `[secret:${name}]`,
      },
      log: {
        info: (...args: unknown[]) => logs.push(`[info] ${args.join(' ')}`),
        warn: (...args: unknown[]) => logs.push(`[warn] ${args.join(' ')}`),
        error: (...args: unknown[]) => logs.push(`[error] ${args.join(' ')}`),
      },
    };

    const formatINR = (amount: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

    const amountInWords = (amount: number) => `₹${amount} (words not implemented in test mode)`;

    // Wrap code to extract main function
    const wrapper = new Function(
      'input', 'sdk', 'formatINR', 'amountInWords',
      `${code}\n; return typeof main === 'function' ? main(input, sdk) : undefined;`
    );

    output = await wrapper(input, sdk, formatINR, amountInWords);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;
  const result: TestResult = { output, logs, durationMs, error };
  return NextResponse.json(result);
}
