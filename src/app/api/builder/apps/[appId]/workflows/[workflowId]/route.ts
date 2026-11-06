import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { WorkflowDef, TriggerDef } from '@/platform/contracts/rules';

type Params = Promise<{ appId: string; workflowId: string }>;

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

/** GET /api/builder/apps/[appId]/workflows/[workflowId]?tenant=... */
export async function GET(
  req: NextRequest,
  { params }: { params: Params }
): Promise<NextResponse> {
  const { workflowId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM workflows WHERE id = $1`,
    [workflowId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ workflow: rowToWorkflow(result.rows[0]) });
}

/** PUT /api/builder/apps/[appId]/workflows/[workflowId]?tenant=... */
export async function PUT(
  req: NextRequest,
  { params }: { params: Params }
): Promise<NextResponse> {
  const { workflowId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as Partial<WorkflowDef>;

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `UPDATE workflows
     SET name        = COALESCE($2, name),
         description = COALESCE($3, description),
         trigger     = COALESCE($4, trigger),
         actions     = COALESCE($5, actions),
         enabled     = COALESCE($6, enabled),
         version     = version + 1,
         updated_at  = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      workflowId,
      body.name ?? null,
      body.description ?? null,
      body.trigger ? JSON.stringify(body.trigger) : null,
      body.actions ? JSON.stringify(body.actions) : null,
      body.enabled ?? null,
    ]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ workflow: rowToWorkflow(result.rows[0]) });
}

/** DELETE /api/builder/apps/[appId]/workflows/[workflowId]?tenant=... */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Params }
): Promise<NextResponse> {
  const { workflowId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `DELETE FROM workflows WHERE id = $1 RETURNING id`,
    [workflowId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
