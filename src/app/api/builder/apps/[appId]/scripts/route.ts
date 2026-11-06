import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { ScriptDef } from '@/platform/contracts/rules';

async function ensureTable(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS scripts (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id      TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      language    TEXT NOT NULL DEFAULT 'javascript',
      code        TEXT NOT NULL DEFAULT '',
      version     INT NOT NULL DEFAULT 1,
      test_cases  JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

function rowToScript(row: Record<string, unknown>): ScriptDef {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    language: 'javascript',
    code: row.code as string,
    version: row.version as number,
    testCases: row.test_cases as ScriptDef['testCases'],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** GET /api/builder/apps/[appId]/scripts?tenant=... */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  await ensureTable(ctx.schemaName);

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM scripts WHERE app_id = $1 ORDER BY created_at ASC`,
    [appId]
  );
  return NextResponse.json({ scripts: result.rows.map(rowToScript) });
}

/** POST /api/builder/apps/[appId]/scripts?tenant=... */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  await ensureTable(ctx.schemaName);

  const body = (await req.json()) as Partial<ScriptDef>;
  const name = body.name ?? 'Untitled script';
  const code = body.code ?? '// Script\nasync function main(input, sdk) {\n  return {};\n}\n';
  const testCases = body.testCases ?? [];

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `INSERT INTO scripts (app_id, name, description, language, code, version, test_cases)
     VALUES ($1, $2, $3, 'javascript', $4, 1, $5)
     RETURNING *`,
    [appId, name, body.description ?? null, code, JSON.stringify(testCases)]
  );
  return NextResponse.json({ script: rowToScript(result.rows[0]) }, { status: 201 });
}
