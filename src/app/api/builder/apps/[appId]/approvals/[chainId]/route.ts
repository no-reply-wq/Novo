import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import type { ApprovalChainDef } from '@/platform/contracts/rules';

type Params = Promise<{ appId: string; chainId: string }>;

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

/** GET /api/builder/apps/[appId]/approvals/[chainId] */
export async function GET(
  req: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { appId, chainId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);
  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM approval_chains WHERE id = $1 AND app_id = $2 LIMIT 1`,
    [chainId, appId],
  );
  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ chain: rowToChain(result.rows[0]) });
}

/** PUT /api/builder/apps/[appId]/approvals/[chainId] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { appId, chainId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);

  const body = (await req.json()) as Partial<ApprovalChainDef>;

  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `UPDATE approval_chains
     SET name            = COALESCE($3, name),
         table_id        = COALESCE($4, table_id),
         levels          = COALESCE($5::jsonb, levels),
         on_approved     = $6::jsonb,
         on_rejected     = $7::jsonb,
         amount_field_id = $8,
         updated_at      = NOW()
     WHERE id = $1 AND app_id = $2
     RETURNING *`,
    [
      chainId,
      appId,
      body.name ?? null,
      body.tableId ?? null,
      body.levels ? JSON.stringify(body.levels) : null,
      body.onApproved ? JSON.stringify(body.onApproved) : null,
      body.onRejected ? JSON.stringify(body.onRejected) : null,
      body.amountFieldId ?? null,
    ],
  );
  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ chain: rowToChain(result.rows[0]) });
}

/** DELETE /api/builder/apps/[appId]/approvals/[chainId] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { appId, chainId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);
  const result = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `DELETE FROM approval_chains WHERE id = $1 AND app_id = $2 RETURNING id`,
    [chainId, appId],
  );
  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
