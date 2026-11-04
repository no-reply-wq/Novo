import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

async function ensureReports(schema: string) {
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL, description TEXT DEFAULT '',
    table_id TEXT, columns JSONB DEFAULT '[]',
    filters JSONB DEFAULT '[]', group_by TEXT DEFAULT '',
    sort_by TEXT DEFAULT 'created_at', sort_dir TEXT DEFAULT 'desc',
    row_limit INT DEFAULT 500, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureReports(ctx.schemaName);
  const r = await tenantQuery(ctx.schemaName, `SELECT rp.*, t.label as table_label, t.slug as table_slug FROM _reports rp LEFT JOIN _tables t ON t.id = rp.table_id WHERE rp.is_active=true ORDER BY rp.created_at DESC`);
  return NextResponse.json({ reports: r.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureReports(ctx.schemaName);
  const body = await req.json();
  const { id, name, description='', table_id, columns=[], filters=[], group_by='', sort_by='created_at', sort_dir='desc', row_limit=500 } = body;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (id) {
    const r = await tenantQuery(ctx.schemaName, `UPDATE _reports SET name=$1,description=$2,table_id=$3,columns=$4,filters=$5,group_by=$6,sort_by=$7,sort_dir=$8,row_limit=$9 WHERE id=$10 RETURNING *`,
      [name,description,table_id||null,JSON.stringify(columns),JSON.stringify(filters),group_by,sort_by,sort_dir,row_limit,id]);
    return NextResponse.json({ report: r.rows[0] });
  }
  const r = await tenantQuery(ctx.schemaName, `INSERT INTO _reports (name,description,table_id,columns,filters,group_by,sort_by,sort_dir,row_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name,description,table_id||null,JSON.stringify(columns),JSON.stringify(filters),group_by,sort_by,sort_dir,row_limit]);
  return NextResponse.json({ report: r.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const reportId = searchParams.get('reportId');
  if (!tenantSlug || !reportId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await tenantQuery(ctx.schemaName, `UPDATE _reports SET is_active=false WHERE id=$1`, [reportId]);
  return NextResponse.json({ ok: true });
}
