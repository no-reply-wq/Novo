import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get('tenant');
  if (!tenant) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const schemaName = `tenant_${tenant.replace(/-/g, '_')}`;
  try {
    const r = await tenantQuery(schemaName, `SELECT * FROM _forms WHERE slug = $1 AND is_active = true AND is_public = true`, [slug]);
    if (!r.rows.length) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const form = r.rows[0];
    return NextResponse.json({ form: { id: form.id, slug: form.slug, title: form.title, description: form.description, fields: form.fields, settings: form.settings } });
  } catch { return NextResponse.json({ error: 'Form not found' }, { status: 404 }); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get('tenant');
  if (!tenant) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const schemaName = `tenant_${tenant.replace(/-/g, '_')}`;
  try {
    const r = await tenantQuery(schemaName, `SELECT f.*, t.slug as table_slug FROM _forms f LEFT JOIN _tables t ON t.id = f.table_id WHERE f.slug = $1 AND f.is_active = true AND f.is_public = true`, [slug]);
    if (!r.rows.length) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const form = r.rows[0];
    if (!form.table_slug) return NextResponse.json({ error: 'Form has no linked table' }, { status: 400 });
    const body = await req.json();
    const { data = {} } = body;
    const fields = form.fields as Array<{ field_slug: string; required: boolean; label: string }>;
    for (const f of fields) {
      if (f.required && (data[f.field_slug] === undefined || data[f.field_slug] === '' || data[f.field_slug] === null)) {
        return NextResponse.json({ error: `${f.label} is required` }, { status: 400 });
      }
    }
    const colsResult = await tenantQuery(schemaName, `SELECT slug FROM _fields WHERE table_id = (SELECT id FROM _tables WHERE slug = $1) AND NOT is_system AND type != 'auto_number'`, [form.table_slug]);
    const validSlugs = new Set(colsResult.rows.map((c: {slug: string}) => c.slug));
    const cols = Object.keys(data).filter(k => validSlugs.has(k));
    if (cols.length === 0) {
      await tenantQuery(schemaName, `INSERT INTO ct_${form.table_slug} DEFAULT VALUES`);
    } else {
      await tenantQuery(schemaName, `INSERT INTO ct_${form.table_slug} (${cols.join(',')}) VALUES (${cols.map((_,i) => `$${i+1}`).join(',')})`, cols.map(c => data[c] || null));
    }
    const settings = form.settings as { success_message?: string; redirect_url?: string };
    return NextResponse.json({ ok: true, success_message: settings?.success_message || 'Thank you for your submission!', redirect_url: settings?.redirect_url || null });
  } catch(e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
