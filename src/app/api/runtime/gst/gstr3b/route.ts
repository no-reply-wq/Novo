/**
 * GET /api/runtime/gst/gstr3b?appId=&tenantSlug=&period=MM-YYYY
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildGstr3b } from '@/platform/gst/gstr-builder';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = req.nextUrl;
  const appId = searchParams.get('appId') ?? '';
  const tenantSlug = ctx.tenant.slug;
  const period = searchParams.get('period') ?? '';

  if (!appId || !period) {
    return NextResponse.json({ error: 'appId and period are required' }, { status: 400 });
  }

  if (!/^\d{2}-\d{4}$/.test(period)) {
    return NextResponse.json({ error: 'period must be MM-YYYY' }, { status: 400 });
  }

  try {
    const summary = await buildGstr3b(appId, tenantSlug, period, pgPool);
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
