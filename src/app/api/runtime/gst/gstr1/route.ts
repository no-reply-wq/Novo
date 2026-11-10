/**
 * GET /api/runtime/gst/gstr1?appId=&period=MM-YYYY&invoiceTable=
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildGstr1 } from '@/platform/gst/gstr-builder';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = req.nextUrl;
  const appId = searchParams.get('appId') ?? '';
  const period = searchParams.get('period') ?? '';
  const invoiceTable = searchParams.get('invoiceTable') ?? 'invoices';
  const tenantSlug = ctx.tenant.slug;

  if (!appId || !period) {
    return NextResponse.json({ error: 'appId and period are required' }, { status: 400 });
  }

  if (!/^\d{2}-\d{4}$/.test(period)) {
    return NextResponse.json({ error: 'period must be MM-YYYY' }, { status: 400 });
  }

  try {
    const report = await buildGstr1(appId, tenantSlug, period, invoiceTable, pgPool);
    return NextResponse.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
