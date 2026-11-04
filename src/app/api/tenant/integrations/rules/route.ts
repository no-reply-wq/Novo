import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

async function ensureTable(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS notification_rules (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name          TEXT NOT NULL,
      integration   TEXT NOT NULL,
      form_id       TEXT NOT NULL,
      trigger_type  TEXT NOT NULL DEFAULT 'form_submit',
      recipient_field TEXT,
      recipient_fixed TEXT,
      subject_template TEXT,
      body_template TEXT NOT NULL,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.INTEGRATIONS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);
  const result = await tenantQuery(ctx.schemaName,
    `SELECT * FROM notification_rules ${formId ? 'WHERE form_id = $1' : ''} ORDER BY created_at DESC`,
    formId ? [formId] : []
  );
  return NextResponse.json({ rules: result.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.INTEGRATIONS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);
  const body = await req.json().catch(() => ({}));
  const { name, integration, form_id, trigger_type, recipient_field, recipient_fixed, subject_template, body_template } = body;
  if (!name || !integration || !form_id || !body_template) {
    return NextResponse.json({ error: 'name, integration, form_id, body_template required' }, { status: 400 });
  }
  const result = await tenantQuery(ctx.schemaName,
    `INSERT INTO notification_rules (name, integration, form_id, trigger_type, recipient_field, recipient_fixed, subject_template, body_template)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, integration, form_id, trigger_type ?? 'form_submit', recipient_field ?? null, recipient_fixed ?? null, subject_template ?? null, body_template]
  );
  return NextResponse.json({ rule: result.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const id = searchParams.get('id');
  if (!tenantSlug || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.INTEGRATIONS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await tenantQuery(ctx.schemaName, `DELETE FROM notification_rules WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
