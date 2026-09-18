import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

async function ensureNavTable(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS _nav_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      icon TEXT DEFAULT 'layers',
      section TEXT DEFAULT 'main',
      sort_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureNavTable(ctx.schemaName);
  const result = await tenantQuery(ctx.schemaName, `SELECT * FROM _nav_items WHERE is_active = true ORDER BY section, sort_order ASC`);
  return NextResponse.json({ items: result.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureNavTable(ctx.schemaName);
  const { label, href, icon = 'layers', section = 'main', sort_order = 0 } = await req.json();
  if (!label || !href) return NextResponse.json({ error: 'label and href required' }, { status: 400 });
  const result = await tenantQuery(ctx.schemaName,
    `INSERT INTO _nav_items (label, href, icon, section, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [label, href, icon, section, sort_order]
  );
  return NextResponse.json({ item: result.rows[0] });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const id = searchParams.get('id');
  if (!tenantSlug || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const { label, href, icon, section, sort_order } = await req.json();
  const result = await tenantQuery(ctx.schemaName,
    `UPDATE _nav_items SET label=$1, href=$2, icon=$3, section=$4, sort_order=$5 WHERE id=$6 RETURNING *`,
    [label, href, icon, section, sort_order, id]
  );
  return NextResponse.json({ item: result.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const id = searchParams.get('id');
  if (!tenantSlug || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await tenantQuery(ctx.schemaName, `UPDATE _nav_items SET is_active=false WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
