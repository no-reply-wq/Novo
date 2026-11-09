import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { randomUUID } from 'crypto';
import type { DrilldownConfig } from '@/platform/analytics/drilldown';

export async function GET(req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  try {
    const { appId } = await params;
    const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
    if (ctx instanceof NextResponse) return ctx;
    const res = await pgPool.query<{ id: string; config: DrilldownConfig; created_at: string }>(
      `SELECT id, config, created_at FROM platform.analytics_drilldown_configs WHERE app_id = $1 ORDER BY created_at DESC`,
      [appId],
    );
    return NextResponse.json({ configs: res.rows });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  try {
    const { appId } = await params;
    const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
    if (ctx instanceof NextResponse) return ctx;
    const body = (await req.json()) as { config?: DrilldownConfig };
    const { config } = body;
    const tenantSlug = ctx.tenant.slug;
    if (!config) return NextResponse.json({ error: 'config is required' }, { status: 400 });
    const id = randomUUID();
    await pgPool.query(`INSERT INTO platform.analytics_drilldown_configs (id, app_id, tenant_slug, config) VALUES ($1, $2, $3, $4)`, [id, appId, tenantSlug, JSON.stringify(config)]);
    return NextResponse.json({ id, appId, config }, { status: 201 });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
