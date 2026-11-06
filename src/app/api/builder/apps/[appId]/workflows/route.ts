import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { WorkflowDef, TriggerDef } from '@/platform/contracts/rules';

async function ensureTable(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS workflows (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id      TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      trigger     JSONB NOT NULL DEFAULT '{}',
      actions     JSONB NOT NULL DEFAULT '[]',
      enabled     BOOLEAN NOT NULL DEFAULT false,
      version     INT NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

function rowToWorkflow(row: Record<string, unknown>): WorkflowDef {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    trigger: row.trigger as TriggerDef,
    actions: row.actions as WorkflowDef['actions'],
    enabled: row.enabled as boolean,
    version: row.version as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** GET /api/builder/apps/[appId]/workflows?tenant=... */
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
    `SELECT * FROM workflows WHERE app_id = $1 ORDER BY created_at ASC`,
    [appId]
  );
  return NextResponse.json({ workflows: result.rows.map(rowToWorkflow) });
}

/** POST /api/builder/apps/[appId]/workflows?tenant=... */
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

  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const defaultTrigger: TriggerDef = {
    id: `trig_${Date.now()}`,
    workflowId: '',
    event: 'record_created',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `INSERT INTO workflows (app_id, name, description, trigger, actions, enabled, version)
     VALUES ($1, $2, $3, $4, $5, false, 1)
     RETURNING *`,
    [appId, body.name, body.description ?? null, JSON.stringify(defaultTrigger), JSON.stringify([])]
  );
  return NextResponse.json({ workflow: rowToWorkflow(result.rows[0]) }, { status: 201 });
}
