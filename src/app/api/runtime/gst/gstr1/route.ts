/**
 * GET /api/runtime/gst/gstr1?appId=&period=MM-YYYY&invoiceTable=
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildGstr1 } from '@/platform/gst/gstr-builder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const appId = searchParams.get('appId') ?? '';
  const period = searchParams.get('period') ?? '';
  const invoiceTable = searchParams.get('invoiceTable') ?? 'invoices';
  const tenantSlug = searchParams.get('tenantSlug') ?? '';

  if (!appId || !period || !tenantSlug) {
    return NextResponse.json({ error: 'appId, tenantSlug and period are required' }, { status: 400 });
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
