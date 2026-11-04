import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

async function ensureTable(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS page_layouts (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      page_key    TEXT NOT NULL UNIQUE,
      layout      JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const pageKey = searchParams.get('pageKey');
  if (!tenantSlug || !pageKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.UI_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;
  await ensureTable(ctx.schemaName);
  const result = await tenantQuery(ctx.schemaName, `SELECT layout FROM page_layouts WHERE page_key = $1`, [pageKey]);
  if (result.rows.length === 0) return NextResponse.json({ layout: null });
  return NextResponse.json({ layout: result.rows[0].layout });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.UI_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const { pageKey, layout } = body;
  if (!pageKey || !layout) return NextResponse.json({ error: 'pageKey and layout required' }, { status: 400 });
  await ensureTable(ctx.schemaName);
  await tenantQuery(ctx.schemaName, `
    INSERT INTO page_layouts (page_key, layout, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (page_key) DO UPDATE SET layout = $2, updated_at = NOW()
  `, [pageKey, JSON.stringify(layout)]);
  return NextResponse.json({ success: true });
}
