/**
 * Runtime API: execute a tenant script.
 * Called by workflows, buttons and automations at runtime.
 *
 * POST /api/runtime/[tenantSlug]/scripts/[scriptId]/run
 * Body: { input: Record<string, unknown> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScript, ScriptDef } from '@/platform/scripts/sandbox';
import { buildSdk, SdkDeps } from '@/platform/scripts/sdk';
import { Pool } from 'pg';

type Params = Promise<{ tenantSlug: string; scriptId: string }>;

// In-memory script store (replace with Postgres lookup in production).
const scriptStore = new Map<string, ScriptDef>();

/** Register a script definition (called from builder on save). */
export function registerScript(script: ScriptDef): void {
  scriptStore.set(script.id, script);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { tenantSlug, scriptId } = await params;

  let body: { input?: Record<string, unknown> };
  try {
    body = (await req.json()) as { input?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const script = scriptStore.get(scriptId);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptId}" not found` }, { status: 404 });
  }

  const input = body.input ?? {};

  try {
    // Build a minimal pool for runtime (replace with shared pool in production).
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    const logs: string[] = [];
    const returnBox: { value: unknown; set: boolean } = { value: undefined, set: false };
    const deps: SdkDeps = { pool, tenantSlug };
    const sdk = buildSdk(deps, logs, returnBox);

    const result = await runScript(script, {
      tenantSlug,
      userId: 'runtime',
      input,
      scriptId,
    }, sdk);

    return NextResponse.json({
      output: result.output,
      logs: result.logs,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
