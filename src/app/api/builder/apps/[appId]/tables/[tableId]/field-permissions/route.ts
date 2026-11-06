/**
 * GET    /api/builder/apps/[appId]/tables/[tableId]/field-permissions
 * POST   /api/builder/apps/[appId]/tables/[tableId]/field-permissions
 * DELETE /api/builder/apps/[appId]/tables/[tableId]/field-permissions?id=<permId>
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { FieldPermission } from '@/platform/access/types';

type Params = { appId: string; tableId: string };

function rowToPermission(row: Record<string, unknown>): FieldPermission {
  return {
    id: row.id as string,
    tableId: row.table_id as string,
    fieldId: row.field_id as string,
    roleId: row.role_id as string,
    permission: row.permission as FieldPermission['permission'],
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
    `SELECT * FROM platform.field_permissions WHERE table_id = $1 ORDER BY field_id, role_id`,
    [tableId],
  );

  return NextResponse.json({ permissions: rows.map((r) => rowToPermission(r as Record<string, unknown>)) });
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
  const { fieldId, roleId, permission } = b;

  if (typeof fieldId !== 'string' || !fieldId) {
    return NextResponse.json({ error: 'fieldId is required' }, { status: 400 });
  }
  if (typeof roleId !== 'string' || !roleId) {
    return NextResponse.json({ error: 'roleId is required' }, { status: 400 });
  }
  if (typeof permission !== 'string' || !['hidden','read_only','editable'].includes(permission)) {
    return NextResponse.json({ error: 'permission must be hidden, read_only, or editable' }, { status: 400 });
  }

  const { rows } = await tenantQuery(
    ctx.schemaName,
    `INSERT INTO platform.field_permissions (table_id, field_id, role_id, permission)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (table_id, field_id, role_id) DO UPDATE SET permission = EXCLUDED.permission
     RETURNING *`,
    [tableId, fieldId, roleId, permission],
  );

  return NextResponse.json(
    { permission: rowToPermission(rows[0] as Record<string, unknown>) },
    { status: 201 },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const permId = searchParams.get('id');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  if (!permId) return NextResponse.json({ error: 'Missing permission id' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  await tenantQuery(
    ctx.schemaName,
    `DELETE FROM platform.field_permissions WHERE id = $1 AND table_id = $2`,
    [permId, tableId],
  );

  return NextResponse.json({ ok: true });
}
