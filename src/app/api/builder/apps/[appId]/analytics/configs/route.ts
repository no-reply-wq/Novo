import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { randomUUID } from 'crypto';
import type { DrilldownConfig } from '@/platform/analytics/drilldown';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  try {
    const { appId } = await params;
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
    const body = (await req.json()) as { config?: DrilldownConfig; tenantSlug?: string };
    const { config, tenantSlug } = body;
    if (!config || !tenantSlug) return NextResponse.json({ error: 'config and tenantSlug are required' }, { status: 400 });
    const id = randomUUID();
    await pgPool.query(`INSERT INTO platform.analytics_drilldown_configs (id, app_id, tenant_slug, config) VALUES ($1, $2, $3, $4)`, [id, appId, tenantSlug, JSON.stringify(config)]);
    return NextResponse.json({ id, appId, config }, { status: 201 });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
