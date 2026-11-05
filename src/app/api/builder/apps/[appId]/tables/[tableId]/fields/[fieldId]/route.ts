import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import type { FieldType } from '@/platform/contracts/fields';

type Params = { appId: string; tableId: string; fieldId: string };

/** PUT /api/builder/apps/[appId]/tables/[tableId]/fields/[fieldId]?tenant=... */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { fieldId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as {
    name?: string;
    options?: Record<string, unknown>;
    required?: boolean;
    unique?: boolean;
    defaultValue?: unknown;
    lockWhen?: string;
    hint?: string;
    rank?: number;
  };

  const allowed: Array<[string, string]> = [
    ['name', 'label'],
    ['options', 'options'],
    ['required', 'is_required'],
    ['unique', 'is_unique'],
    ['defaultValue', 'default_value'],
    ['lockWhen', 'lock_when'],
    ['hint', 'hint'],
    ['rank', 'field_order'],
  ];

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  for (const [bodyKey, dbCol] of allowed) {
    if (bodyKey in body) {
      sets.push(`${dbCol} = $${idx++}`);
      const val = body[bodyKey as keyof typeof body];
      vals.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    }
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  sets.push(`updated_at = NOW()`);
  vals.push(fieldId);

  const result = await tenantQuery(
    ctx.schemaName,
    `UPDATE _fields SET ${sets.join(', ')} WHERE id = $${idx} AND is_system = false RETURNING *`,
    vals
  );
  if (!result.rows.length) {
    return NextResponse.json({ error: 'Field not found or is a system field' }, { status: 404 });
  }
  return NextResponse.json({ field: result.rows[0] });
}

/** DELETE /api/builder/apps/[appId]/tables/[tableId]/fields/[fieldId]?tenant=... */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { fieldId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const field = await tenantQuery(
    ctx.schemaName,
    `SELECT f.*, t.slug AS table_slug FROM _fields f JOIN _tables t ON t.id = f.table_id WHERE f.id = $1`,
    [fieldId]
  );
  if (!field.rows.length) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

  const { slug, table_slug, is_system, type } = field.rows[0] as {
    slug: string;
    table_slug: string;
    is_system: boolean;
    type: FieldType;
  };

  if (is_system) return NextResponse.json({ error: 'Cannot delete system fields' }, { status: 400 });

  const computedTypes = new Set(['formula', 'rollup', 'lookup_value', 'auto_number', 'status_from_rules']);
  if (!computedTypes.has(type)) {
    await tenantQuery(ctx.schemaName, `ALTER TABLE ct_${table_slug} DROP COLUMN IF EXISTS ${slug}`);
  }

  await tenantQuery(ctx.schemaName, `DELETE FROM _fields WHERE id = $1`, [fieldId]);
  return NextResponse.json({ ok: true });
}
