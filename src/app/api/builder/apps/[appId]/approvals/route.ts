import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { ApprovalChainDef } from '@/platform/contracts/rules';

async function ensureTable(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS approval_chains (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id           TEXT NOT NULL,
      name             TEXT NOT NULL,
      table_id         TEXT NOT NULL DEFAULT '',
      levels           JSONB NOT NULL DEFAULT '[]',
      on_approved      JSONB,
      on_rejected      JSONB,
      amount_field_id  TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

function rowToChain(row: Record<string, unknown>): ApprovalChainDef {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    name: row.name as string,
    tableId: row.table_id as string,
    levels: row.levels as ApprovalChainDef['levels'],
    onApproved: row.on_approved as ApprovalChainDef['onApproved'],
    onRejected: row.on_rejected as ApprovalChainDef['onRejected'],
    amountFieldId: row.amount_field_id as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** GET /api/builder/apps/[appId]/approvals?tenant=... */
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
    `SELECT * FROM approval_chains WHERE app_id = $1 ORDER BY created_at ASC`,
    [appId]
  );
  return NextResponse.json({ chains: result.rows.map(rowToChain) });
}

/** POST /api/builder/apps/[appId]/approvals?tenant=... */
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

  const body = (await req.json()) as Partial<ApprovalChainDef>;
  const name = body.name ?? 'Untitled chain';
  const tableId = body.tableId ?? '';
  const levels = body.levels ?? [];

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `INSERT INTO approval_chains
       (app_id, name, table_id, levels, on_approved, on_rejected, amount_field_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      appId,
      name,
      tableId,
      JSON.stringify(levels),
      body.onApproved ? JSON.stringify(body.onApproved) : null,
      body.onRejected ? JSON.stringify(body.onRejected) : null,
      body.amountFieldId ?? null,
    ]
  );
  return NextResponse.json({ chain: rowToChain(result.rows[0]) }, { status: 201 });
}
