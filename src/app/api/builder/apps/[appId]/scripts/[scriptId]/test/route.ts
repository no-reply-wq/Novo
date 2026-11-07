import { NextRequest, NextResponse } from 'next/server';
import { runScriptTests } from '@/platform/scripts/test-runner';
import type { ScriptContext } from '@/platform/sdk/types';
import { pgPool } from '@/lib/db/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string; scriptId: string }> }) {
  const { appId, scriptId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant query param required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    testCases?: import('@/platform/scripts/test-runner').ScriptTestCase[];
    timeoutMs?: number;
  };

  const result = await pgPool.query(
    `SELECT code FROM scripts WHERE id = $1 AND app_id = $2`,
    [scriptId, appId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }

  const code: string = result.rows[0].code;

  const context: Omit<ScriptContext, 'input'> = {
    trigger: 'manual',
    userId: req.headers.get('x-user-id') ?? '',
    tenantSlug,
    appId,
  };

  const testCases = body.testCases ?? [];
  const results = await runScriptTests(code, testCases, context, body.timeoutMs ?? 8_000);

  return NextResponse.json({ results });
}
