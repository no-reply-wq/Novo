import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

function triggerWorkflows(req: NextRequest, tenantSlug: string, triggerType: string, tableId: string, tableSlug: string, row: Record<string, unknown>, oldRow?: Record<string, unknown>) {
  // Fire and forget — never await this, never let it block or crash the main response
  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    fetch(`${baseUrl}/api/platform/workflows/run?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ trigger_type: triggerType, table_id: tableId, table_slug: tableSlug, row, old_row: oldRow }),
    }).catch(e => console.error('Workflow trigger failed:', e));
  } catch (e) { console.error('Workflow trigger setup failed:', e); }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50'), 500);
  const search = searchParams.get('search') ?? '';
  const sortField = searchParams.get('sort') ?? 'created_at';
  const sortDir = searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT * FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  const table = tableMeta.rows[0];
  const tableName = `ct_${table.slug}`;
  const fields = await tenantQuery(ctx.schemaName, `SELECT * FROM _fields WHERE table_id = $1 ORDER BY field_order ASC`, [tableId]);
  const textFields = fields.rows.filter((f: {type: string}) => ['text','email','phone','url','select','long_text'].includes(f.type));
  let whereClause = '';
  const params: unknown[] = [];
  if (search && textFields.length > 0) {
    const conditions = textFields.map((f: {slug: string}, i: number) => `${f.slug}::text ILIKE $${i + 1}`);
    params.push(...textFields.map(() => `%${search}%`));
    whereClause = `WHERE ${conditions.join(' OR ')}`;
  }
  const offset = (page - 1) * pageSize;
  const countResult = await tenantQuery(ctx.schemaName, `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total);
  params.push(pageSize, offset);
  const rows = await tenantQuery(ctx.schemaName, `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${sortField} ${sortDir} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return NextResponse.json({ rows: rows.rows, total, page, pageSize, pages: Math.ceil(total / pageSize), table, fields: fields.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  const tableName = `ct_${tableMeta.rows[0].slug}`;
  const body = await req.json();
  const { data = {} } = body;
  const fields = await tenantQuery(ctx.schemaName, `SELECT slug, type FROM _fields WHERE table_id = $1 AND NOT is_system AND type != 'auto_number'`, [tableId]);
  const validSlugs = new Set(fields.rows.map((f: {slug: string}) => f.slug));
  const cols = Object.keys(data).filter(k => validSlugs.has(k));
  if (cols.length === 0) {
    const result = await tenantQuery(ctx.schemaName, `INSERT INTO ${tableName} DEFAULT VALUES RETURNING *`);
    const newRow = result.rows[0];
    triggerWorkflows(req, tenantSlug, 'on_create', tableId, tableMeta.rows[0].slug, newRow);
    return NextResponse.json({ row: newRow });
  }
  const vals = cols.map((_, i) => `$${i + 1}`);
  const result = await tenantQuery(ctx.schemaName, `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${vals.join(',')}) RETURNING *`, cols.map(c => data[c]));
  const newRow2 = result.rows[0];
  triggerWorkflows(req, tenantSlug, 'on_create', tableId, tableMeta.rows[0].slug, newRow2);
  return NextResponse.json({ row: newRow2 });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const rowId = searchParams.get('rowId');
  if (!tenantSlug || !tableId || !rowId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  const tableName = `ct_${tableMeta.rows[0].slug}`;
  const body = await req.json();
  const { data = {} } = body;
  const fields = await tenantQuery(ctx.schemaName, `SELECT slug FROM _fields WHERE table_id = $1 AND NOT is_system AND type != 'auto_number'`, [tableId]);
  const validSlugs = new Set(fields.rows.map((f: {slug: string}) => f.slug));
  const cols = Object.keys(data).filter(k => validSlugs.has(k));
  if (cols.length === 0) {
    // No valid fields to update - just return the existing row
    const existing = await tenantQuery(ctx.schemaName, `SELECT * FROM ${tableName} WHERE id = $1`, [rowId]);
    return NextResponse.json({ row: existing.rows[0] ?? {} });
  }
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = [...cols.map(c => data[c]), rowId];
  const result = await tenantQuery(ctx.schemaName, `UPDATE ${tableName} SET ${sets.join(',')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
  if (!result.rows.length) return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  const updatedRow = result.rows[0];
  triggerWorkflows(req, tenantSlug, 'on_update', tableId, tableMeta.rows[0].slug, updatedRow);
  triggerWorkflows(req, tenantSlug, 'on_field_change', tableId, tableMeta.rows[0].slug, updatedRow);
  return NextResponse.json({ row: updatedRow });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const rowId = searchParams.get('rowId');
  if (!tenantSlug || !tableId || !rowId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  await tenantQuery(ctx.schemaName, `DELETE FROM ct_${tableMeta.rows[0].slug} WHERE id = $1`, [rowId]);
  return NextResponse.json({ ok: true });
}
