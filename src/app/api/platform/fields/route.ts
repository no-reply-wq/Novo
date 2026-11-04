import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

const PG_TYPE_MAP: Record<string, string> = { text:'TEXT', long_text:'TEXT', number:'BIGINT', decimal:'NUMERIC(18,4)', boolean:'BOOLEAN DEFAULT false', date:'DATE', datetime:'TIMESTAMPTZ', select:'TEXT', multi_select:'TEXT[]', relation:'TEXT', file:'TEXT', image:'TEXT', email:'TEXT', phone:'TEXT', url:'TEXT', currency:'NUMERIC(18,2)', percent:'NUMERIC(8,4)', json:"JSONB DEFAULT '{}'" };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  const fields = await tenantQuery(ctx.schemaName, `SELECT * FROM _fields WHERE table_id = $1 ORDER BY field_order ASC, created_at ASC`, [tableId]);
  return NextResponse.json({ fields: fields.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json();
  const { tableId, slug, label, type = 'text', options = {}, is_required = false, is_unique = false, default_value } = body;
  if (!tableId || !slug || !label) return NextResponse.json({ error: 'tableId, slug, label required' }, { status: 400 });
  if (!/^[a-z][a-z0-9_]{0,60}$/.test(slug)) return NextResponse.json({ error: 'Invalid field slug' }, { status: 400 });
  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  const tableName = `ct_${tableMeta.rows[0].slug}`;
  const pgType = PG_TYPE_MAP[type] ?? 'TEXT';
  const notNull = is_required && !pgType.includes('DEFAULT') ? 'NOT NULL DEFAULT \'\'' : '';
  try {
    await tenantQuery(ctx.schemaName, `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${slug} ${pgType} ${notNull}`);
    if (is_unique) await tenantQuery(ctx.schemaName, `CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_${slug}_unique ON ${tableName}(${slug})`);
  } catch (e) { return NextResponse.json({ error: `Failed to add column: ${(e as Error).message}` }, { status: 400 }); }
  const fieldCount = await tenantQuery<{ c: string }>(ctx.schemaName, `SELECT COUNT(*) as c FROM _fields WHERE table_id = $1`, [tableId]);
  const order = parseInt(fieldCount.rows[0].c);
  const result = await tenantQuery(ctx.schemaName, `INSERT INTO _fields (table_id, slug, label, type, options, is_required, is_unique, default_value, field_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [tableId, slug, label, type, JSON.stringify(options), is_required, is_unique, default_value ?? null, order]);
  return NextResponse.json({ field: result.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const fieldId = searchParams.get('fieldId');
  if (!tenantSlug || !fieldId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  const field = await tenantQuery(ctx.schemaName, `SELECT f.*, t.slug as table_slug FROM _fields f JOIN _tables t ON t.id = f.table_id WHERE f.id = $1`, [fieldId]);
  if (!field.rows.length) return NextResponse.json({ error: 'Field not found' }, { status: 404 });
  const { slug, table_slug, is_system } = field.rows[0];
  if (is_system) return NextResponse.json({ error: 'Cannot delete system fields' }, { status: 400 });
  await tenantQuery(ctx.schemaName, `ALTER TABLE ct_${table_slug} DROP COLUMN IF EXISTS ${slug}`);
  await tenantQuery(ctx.schemaName, `DELETE FROM _fields WHERE id = $1`, [fieldId]);
  return NextResponse.json({ ok: true });
}
