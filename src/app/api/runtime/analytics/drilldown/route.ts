import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { runDrilldown } from '@/platform/analytics/drilldown';
import type { DrilldownConfig } from '@/platform/analytics/drilldown';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as { config?: DrilldownConfig; level?: number; filters?: Record<string, unknown>; appId?: string };
    const { config, level, filters, appId } = body;
    if (!config || level === undefined || !appId) return NextResponse.json({ error: 'config, level, and appId are required' }, { status: 400 });
    const result = await runDrilldown(config, level, filters ?? {}, appId, ctx.tenant.slug, pgPool);
    return NextResponse.json(result);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
