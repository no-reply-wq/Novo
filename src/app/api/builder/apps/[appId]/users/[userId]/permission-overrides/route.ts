/**
 * GET /api/builder/apps/[appId]/users/[userId]/permission-overrides?tenant=&tableId=
 * PUT /api/builder/apps/[appId]/users/[userId]/permission-overrides?tenant=&tableId=
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { UserPermissionOverride } from '@/platform/access/types';

type Params = { appId: string; userId: string };

function rowToOverride(row: Record<string, unknown>): UserPermissionOverride {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tableId: row.table_id as string,
    overrides: row.overrides as UserPermissionOverride['overrides'],
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { userId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const sql = tableId
    ? `SELECT * FROM platform.user_permission_overrides WHERE user_id = $1 AND table_id = $2`
    : `SELECT * FROM platform.user_permission_overrides WHERE user_id = $1`;
  const args: unknown[] = tableId ? [userId, tableId] : [userId];

  const { rows } = await tenantQuery(ctx.schemaName, sql, args);

  return NextResponse.json({
    overrides: rows.map((r) => rowToOverride(r as Record<string, unknown>)),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { userId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  if (!tableId) return NextResponse.json({ error: 'Missing tableId' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const body: unknown = await req.json();
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const overrides = body as UserPermissionOverride['overrides'];

  // Validate fieldOverrides keys if present
  if (overrides.fieldOverrides) {
    const allowed = new Set(['hidden', 'read_only', 'editable']);
    for (const val of Object.values(overrides.fieldOverrides)) {
      if (!allowed.has(val)) {
        return NextResponse.json(
          { error: `Invalid field override value: ${val}` },
          { status: 400 },
        );
      }
    }
  }

  const { rows } = await tenantQuery(
    ctx.schemaName,
    `INSERT INTO platform.user_permission_overrides (user_id, table_id, overrides)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, table_id) DO UPDATE SET overrides = EXCLUDED.overrides
     RETURNING *`,
    [userId, tableId, JSON.stringify(overrides)],
  );

  return NextResponse.json({
    override: rowToOverride(rows[0] as Record<string, unknown>),
  });
}
