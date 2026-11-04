/**
 * Company Settings API
 * GET  — fetch current company settings (name, logo_url, timezone, currency, etc.)
 * PUT  — update company settings (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireTenantSession } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import { writeAudit } from '@/lib/audit';

const SettingsSchema = z.object({
  company_name: z.string().min(1).max(200).optional(),
  logo_url: z.string().url().max(1000).nullable().optional(),
  timezone: z.string().max(100).optional(),
  currency: z.string().length(3).optional(), // ISO 4217, e.g. USD
  date_format: z.string().max(30).optional(),
  fiscal_year_start: z.number().int().min(1).max(12).optional(), // month number
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
});

async function ensureSettingsTable(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS company_settings (
      id            TEXT PRIMARY KEY DEFAULT 'default',
      company_name  TEXT,
      logo_url      TEXT,
      timezone      TEXT NOT NULL DEFAULT 'UTC',
      currency      TEXT NOT NULL DEFAULT 'USD',
      date_format   TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
      fiscal_year_start INTEGER NOT NULL DEFAULT 1,
      address       TEXT,
      phone         TEXT,
      email         TEXT,
      website       TEXT,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Ensure a default row exists
  await tenantQuery(schemaName, `
    INSERT INTO company_settings (id) VALUES ('default')
    ON CONFLICT (id) DO NOTHING
  `);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  await ensureSettingsTable(ctx.schemaName);

  const result = await tenantQuery(ctx.schemaName, `SELECT * FROM company_settings WHERE id = 'default'`);
  return NextResponse.json({ settings: result.rows[0] ?? null });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  // Only admins (settings module, edit permission) can change company settings
  const ctx = await requirePermission(tenantSlug, MODULE.SETTINGS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  await ensureSettingsTable(ctx.schemaName);

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = SettingsSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });

  const updates = parsed.data;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const keys = Object.keys(updates) as (keyof typeof updates)[];
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => updates[k]);

  await tenantQuery(
    ctx.schemaName,
    `UPDATE company_settings SET ${setClauses}, updated_at = NOW() WHERE id = 'default'`,
    values
  );

  writeAudit(ctx.schemaName, ctx.tenantUserId, 'update', 'company_settings', 'default', { after: updates }).catch(() => {});

  const result = await tenantQuery(ctx.schemaName, `SELECT * FROM company_settings WHERE id = 'default'`);
  return NextResponse.json({ settings: result.rows[0] });
}
