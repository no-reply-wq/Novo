import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { runDrilldown } from '@/platform/analytics/drilldown';
import type { DrilldownConfig } from '@/platform/analytics/drilldown';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      config?: DrilldownConfig;
      level?: number;
      filters?: Record<string, unknown>;
      appId?: string;
      tenantSlug?: string;
    };
    const { config, level, filters, appId, tenantSlug } = body;
    if (!config || level === undefined || !appId || !tenantSlug) {
      return NextResponse.json({ error: 'config, level, appId, and tenantSlug are required' }, { status: 400 });
    }
    const result = await runDrilldown(config, level, filters ?? {}, appId, tenantSlug, pgPool);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
