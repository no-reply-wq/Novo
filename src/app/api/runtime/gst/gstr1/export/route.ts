/**
 * GET /api/runtime/gst/gstr1/export?appId=&period=MM-YYYY&invoiceTable=&format=json|csv
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildGstr1, exportGstr1ToJson, exportGstr1ToCsv } from '@/platform/gst/gstr-builder';
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
  const format = (searchParams.get('format') ?? 'json') as 'json' | 'csv';

  if (!appId || !period) {
    return NextResponse.json({ error: 'appId and period are required' }, { status: 400 });
  }

  try {
    const report = await buildGstr1(appId, tenantSlug, period, invoiceTable, pgPool);

    if (format === 'csv') {
      const csv = exportGstr1ToCsv(report);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="GSTR1_${period.replace('-', '_')}.csv"`,
        },
      });
    }

    const json = exportGstr1ToJson(report);
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="GSTR1_${period.replace('-', '_')}.json"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
