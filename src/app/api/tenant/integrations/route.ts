/**
 * Integrations API
 * GET    — list integrations for a tenant (passwords masked)
 * POST   — create a new integration (SMTP also synced to company_settings)
 * DELETE — remove an integration by id
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession, requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { MODULE } from '@/lib/auth/modules';
import { z } from 'zod';

const IntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['webhook', 'smtp', 'slack', 'whatsapp', 'api']),
  config: z.record(z.string(), z.unknown()),
  is_active: z.boolean().optional().default(true),
});

async function ensureTable(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS integrations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('webhook','smtp','slack','whatsapp','api')),
      config     JSONB NOT NULL DEFAULT '{}',
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, []);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant') ?? '';
    if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

    const ctx = await requireTenantSession(tenantSlug);
    if (ctx instanceof NextResponse) return ctx;

    await ensureTable(ctx.schemaName);

    const result = await tenantQuery(ctx.schemaName, `
      SELECT id, name, type, is_active, created_at,
             CASE WHEN type = 'smtp' THEN jsonb_set(config, '{pass}', '"***"') ELSE config END AS config
      FROM integrations
      ORDER BY created_at DESC
    `, []);

    return NextResponse.json(result.rows);
  } catch (e: unknown) {
    console.error('[integrations] GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant') ?? '';
    if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

    const ctx = await requireTenantSession(tenantSlug);
    if (ctx instanceof NextResponse) return ctx;

    await ensureTable(ctx.schemaName);

    const body = IntegrationSchema.parse(await req.json());

    // If SMTP, also upsert to company_settings so workflow engine can use it
    if (body.type === 'smtp') {
      await tenantQuery(ctx.schemaName, `
        INSERT INTO company_settings (key, value)
        VALUES ('smtp_config', $1::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()
      `, [JSON.stringify(body.config)]);
    }

    const result = await tenantQuery(ctx.schemaName, `
      INSERT INTO integrations (name, type, config, is_active)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING id, name, type, is_active, created_at
    `, [body.name, body.type, JSON.stringify(body.config), body.is_active]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    console.error('[integrations] POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.INTEGRATIONS, 'delete');
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await tenantQuery(ctx.schemaName, `DELETE FROM "${ctx.schemaName}".integrations WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Integrations DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
