import { NextRequest, NextResponse } from 'next/server';
import { runScript } from '@/platform/scripts/runner';
import type { ScriptContext } from '@/platform/sdk/types';
import { pgPool } from '@/lib/db/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string; scriptId: string }> }) {
  const { appId, scriptId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant query param required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    input?: Record<string, unknown>;
    secrets?: Record<string, string>;
    timeoutMs?: number;
  };

  // Fetch the script record from the DB
  const result = await pgPool.query(
    `SELECT code FROM scripts WHERE id = $1 AND app_id = $2`,
    [scriptId, appId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }

  const code: string = result.rows[0].code;

  const context: ScriptContext = {
    trigger: 'manual',
    userId: req.headers.get('x-user-id') ?? '',
    tenantSlug,
    appId,
    input: body.input ?? {},
  };

  const runResult = await runScript(code, context, pgPool, {
    timeoutMs: body.timeoutMs ?? 10_000,
    secrets: body.secrets,
  });

  return NextResponse.json(runResult, { status: runResult.success ? 200 : 422 });
}
