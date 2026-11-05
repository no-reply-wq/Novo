import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

type Params = { appId: string; tableId: string };

/** GET /api/builder/apps/[appId]/tables/[tableId]?tenant=... */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const tableRes = await tenantQuery(ctx.schemaName, `SELECT * FROM _tables WHERE id = $1`, [tableId]);
  if (!tableRes.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

  const fieldsRes = await tenantQuery(
    ctx.schemaName,
    `SELECT * FROM _fields WHERE table_id = $1 ORDER BY field_order ASC, created_at ASC`,
    [tableId]
  );

  const relationsRes = await tenantQuery(
    ctx.schemaName,
    `SELECT * FROM _relations WHERE source_table_id = $1 OR target_table_id = $1 ORDER BY rank ASC`,
    [tableId]
  ).catch(() => ({ rows: [] })); // table may not exist yet

  return NextResponse.json({ table: tableRes.rows[0], fields: fieldsRes.rows, relations: relationsRes.rows });
}

/** PUT /api/builder/apps/[appId]/tables/[tableId]?tenant=... */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as Record<string, unknown>;

  const allowed = ['label', 'icon', 'color', 'description', 'rank', 'is_hidden', 'soft_delete', 'audit_config'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = $${idx++}`);
      vals.push(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]);
    }
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  sets.push(`updated_at = NOW()`);
  vals.push(tableId);

  const result = await tenantQuery(
    ctx.schemaName,
    `UPDATE _tables SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  if (!result.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  return NextResponse.json({ table: result.rows[0] });
}

/** DELETE /api/builder/apps/[appId]/tables/[tableId]?tenant=... */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const meta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!meta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

  const { slug } = meta.rows[0] as { slug: string };
  await tenantQuery(ctx.schemaName, `DROP TABLE IF EXISTS ct_${slug} CASCADE`);
  await tenantQuery(ctx.schemaName, `DELETE FROM _tables WHERE id = $1`, [tableId]);
  return NextResponse.json({ ok: true });
}
