import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

async function ensureMeta(schemaName: string) {
  await tenantQuery(schemaName, `CREATE TABLE IF NOT EXISTS _tables (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL, icon TEXT DEFAULT 'table', color TEXT DEFAULT '#6366f1', description TEXT, is_hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await tenantQuery(schemaName, `CREATE TABLE IF NOT EXISTS _fields (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, table_id TEXT NOT NULL REFERENCES _tables(id) ON DELETE CASCADE, slug TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', options JSONB DEFAULT '{}', is_required BOOLEAN DEFAULT false, is_unique BOOLEAN DEFAULT false, is_system BOOLEAN DEFAULT false, default_value TEXT, field_order INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(table_id, slug))`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureMeta(ctx.schemaName);
  const tables = await tenantQuery(ctx.schemaName, `SELECT t.*, COUNT(f.id) as field_count FROM _tables t LEFT JOIN _fields f ON f.table_id = t.id AND NOT f.is_system GROUP BY t.id ORDER BY t.created_at ASC`);
  return NextResponse.json({ tables: tables.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureMeta(ctx.schemaName);
  const body = await req.json();
  const { label, slug, icon = 'table', color = '#6366f1', description = '' } = body;
  if (!label || !slug) return NextResponse.json({ error: 'label and slug required' }, { status: 400 });
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(slug)) return NextResponse.json({ error: 'Invalid slug — use lowercase letters, numbers, underscores' }, { status: 400 });
  const result = await tenantQuery(ctx.schemaName, `INSERT INTO _tables (slug, label, icon, color, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [slug, label, icon, color, description]);
  const table = result.rows[0];
  await tenantQuery(ctx.schemaName, `CREATE TABLE IF NOT EXISTS ct_${slug} (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await tenantQuery(ctx.schemaName, `INSERT INTO _fields (table_id, slug, label, type, is_system, field_order) VALUES ($1, 'id', 'ID', 'text', true, -3), ($1, 'created_at', 'Created At', 'datetime', true, -2), ($1, 'updated_at', 'Updated At', 'datetime', true, -1)`, [table.id]);
  return NextResponse.json({ table });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const meta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!meta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  await tenantQuery(ctx.schemaName, `DROP TABLE IF EXISTS ct_${meta.rows[0].slug} CASCADE`);
  await tenantQuery(ctx.schemaName, `DELETE FROM _tables WHERE id = $1`, [tableId]);
  return NextResponse.json({ ok: true });
}
