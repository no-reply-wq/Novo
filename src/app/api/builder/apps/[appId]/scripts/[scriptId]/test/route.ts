/**
 * Builder API: run a script with test input using the real isolated-vm sandbox.
 *
 * POST /api/builder/apps/[appId]/scripts/[scriptId]/test
 * Body: { input: Record<string, unknown>; code: string; timeoutMs?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScript, ScriptDef } from '@/platform/scripts/sandbox';
import { ScriptSdk } from '@/platform/scripts/sdk';

type Params = Promise<{ appId: string; scriptId: string }>;

interface TestBody {
  input: Record<string, unknown>;
  code: string;
  timeoutMs?: number;
}

function makeTestSdk(logs: string[]): ScriptSdk {
  const returnBox: { value: unknown; set: boolean } = { value: undefined, set: false };
  return {
    db: {
      query: async () => [],
      insert: async (_table: string, data: Record<string, unknown>) => ({ id: 'test-id', ...data }),
      update: async (_table: string, id: string, data: Record<string, unknown>) => ({ id, ...data }),
    },
    http: {
      get: async (_url: string) => ({ status: 200, body: { mock: true } }),
      post: async (_url: string) => ({ status: 200, body: { mock: true } }),
    },
    secrets: {
      get: async (name: string) => `[secret:${name}]`,
    },
    log: {
      info: (...args: unknown[]) => { logs.push(`[INFO] ${args.map(String).join(' ')}`); },
      warn: (...args: unknown[]) => { logs.push(`[WARN] ${args.map(String).join(' ')}`); },
      error: (...args: unknown[]) => { logs.push(`[ERROR] ${args.map(String).join(' ')}`); },
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
    amountInWords: () => 'Amount In Words',
    return: (value: unknown) => {
      returnBox.value = value;
      returnBox.set = true;
    },
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId, scriptId } = await params;
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const logs: string[] = [];
  const sdk = makeTestSdk(logs);

  const scriptDef: ScriptDef = {
    id: scriptId,
    appId,
    name: 'Test run',
    language: 'javascript',
    code: body.code ?? '',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    timeoutMs: Math.min(body.timeoutMs ?? 5000, 30000),
  };

  try {
    const result = await runScript(scriptDef, {
      tenantSlug: 'builder-preview',
      userId: 'builder',
      input: body.input ?? {},
      scriptId,
    }, sdk);

    return NextResponse.json({
      output: result.output,
      logs: result.logs,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      output: null,
      logs,
      durationMs: 0,
      error: message,
    }, { status: 422 });
  }
}
