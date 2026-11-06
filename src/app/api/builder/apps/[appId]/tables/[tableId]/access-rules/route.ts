/**
 * GET    /api/builder/apps/[appId]/tables/[tableId]/access-rules
 * POST   /api/builder/apps/[appId]/tables/[tableId]/access-rules
 * DELETE /api/builder/apps/[appId]/tables/[tableId]/access-rules?id=<ruleId>
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { TableAccessRule } from '@/platform/access/types';

type Params = { appId: string; tableId: string };

function rowToRule(row: Record<string, unknown>): TableAccessRule {
  return {
    id: row.id as string,
    tableId: row.table_id as string,
    roleId: row.role_id as string,
    operation: row.operation as TableAccessRule['operation'],
    condition: row.condition as string,
    priority: row.priority as number,
    createdAt: row.created_at as Date,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const { rows } = await tenantQuery(
    ctx.schemaName,
    `SELECT * FROM platform.table_access_rules WHERE table_id = $1 ORDER BY priority, created_at`,
    [tableId],
  );

  return NextResponse.json({ rules: rows.map(rowToRule) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const body: unknown = await req.json();
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const { roleId, operation, condition, priority } = b;

  if (typeof roleId !== 'string' || !roleId) {
    return NextResponse.json({ error: 'roleId is required' }, { status: 400 });
  }
  if (typeof operation !== 'string' || !['select','insert','update','delete','all'].includes(operation)) {
    return NextResponse.json({ error: 'operation must be one of select/insert/update/delete/all' }, { status: 400 });
  }
  if (typeof condition !== 'string') {
    return NextResponse.json({ error: 'condition is required' }, { status: 400 });
  }

  const { rows } = await tenantQuery(
    ctx.schemaName,
    `INSERT INTO platform.table_access_rules (table_id, role_id, operation, condition, priority)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (table_id, role_id, operation) DO UPDATE SET
       condition  = EXCLUDED.condition,
       priority   = EXCLUDED.priority
     RETURNING *`,
    [tableId, roleId, operation, condition, typeof priority === 'number' ? priority : 0],
  );

  return NextResponse.json({ rule: rowToRule(rows[0] as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const ruleId = searchParams.get('id');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  if (!ruleId) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  await tenantQuery(
    ctx.schemaName,
    `DELETE FROM platform.table_access_rules WHERE id = $1 AND table_id = $2`,
    [ruleId, tableId],
  );

  return NextResponse.json({ ok: true });
}
