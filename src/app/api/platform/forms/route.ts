import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

async function ensureForms(schemaName: string) {
  await tenantQuery(schemaName, `CREATE TABLE IF NOT EXISTS _forms (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT DEFAULT '', table_id TEXT, fields JSONB DEFAULT '[]', settings JSONB DEFAULT '{}', is_active BOOLEAN DEFAULT true, is_public BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FORMS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureForms(ctx.schemaName);
  if (formId) {
    const r = await tenantQuery(ctx.schemaName, `SELECT f.*, t.slug as table_slug, t.label as table_label FROM _forms f LEFT JOIN _tables t ON t.id = f.table_id WHERE f.id = $1`, [formId]);
    if (!r.rows.length) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    return NextResponse.json({ form: r.rows[0] });
  }
  const r = await tenantQuery(ctx.schemaName, `SELECT f.*, t.label as table_label FROM _forms f LEFT JOIN _tables t ON t.id = f.table_id WHERE f.is_active = true ORDER BY f.created_at DESC`);
  return NextResponse.json({ forms: r.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FORMS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureForms(ctx.schemaName);
  const body = await req.json();
  const { id, title, description = '', table_id, fields = [], settings = {}, is_public = true } = body;
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  if (id) {
    const r = await tenantQuery(ctx.schemaName, `UPDATE _forms SET title=$1, description=$2, table_id=$3, fields=$4, settings=$5, is_public=$6, updated_at=NOW() WHERE id=$7 RETURNING *`, [title, description, table_id || null, JSON.stringify(fields), JSON.stringify(settings), is_public, id]);
    return NextResponse.json({ form: r.rows[0] });
  }
  const autoSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) + '-' + Date.now().toString(36);
  const r = await tenantQuery(ctx.schemaName, `INSERT INTO _forms (slug, title, description, table_id, fields, settings, is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [autoSlug, title, description, table_id || null, JSON.stringify(fields), JSON.stringify(settings), is_public]);
  return NextResponse.json({ form: r.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  if (!tenantSlug || !formId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.FORMS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await tenantQuery(ctx.schemaName, `UPDATE _forms SET is_active=false WHERE id=$1`, [formId]);
  return NextResponse.json({ ok: true });
}
