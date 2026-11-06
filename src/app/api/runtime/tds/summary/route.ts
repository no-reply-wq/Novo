/**
 * Runtime TDS Summary API
 * GET /api/runtime/tds/summary?tenantSlug=...&appId=...&financialYear=...&quarter=1|2|3|4
 *
 * Returns quarterly summary for 26Q filing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { computeQuarterlySummary } from '@/platform/integrations/tds/calculator';

export const dynamic = 'force-dynamic';

interface TDSRecordRow {
  vendor_id: string;
  vendor_name: string | null;
  vendor_pan: string | null;
  section: string;
  gross_amount: string;
  tds_amount: string;
  payment_date: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenantSlug') ?? '';
  const financialYear = searchParams.get('financialYear') ?? '';
  const quarterParam = searchParams.get('quarter');

  if (!tenantSlug || !financialYear) {
    return NextResponse.json({ error: 'tenantSlug and financialYear are required' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const fyStartYear = parseInt(financialYear.split('-')[0] ?? '2024', 10);
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const result = await pgPool.query<TDSRecordRow>(
    `SELECT vendor_id, vendor_name, vendor_pan, section, gross_amount, tds_amount, payment_date
     FROM platform.tds_records
     WHERE tenant_slug = $1 AND financial_year = $2
       AND (payment_date IS NULL OR payment_date BETWEEN $3 AND $4)
     ORDER BY payment_date ASC`,
    [tenantSlug, financialYear, fyStart, fyEnd],
  );

  const payments = result.rows.map(row => ({
    vendorId: row.vendor_id,
    vendorName: row.vendor_name ?? '',
    vendorPAN: row.vendor_pan ?? '',
    amount: parseFloat(row.gross_amount),
    tdsAmount: parseFloat(row.tds_amount),
    section: row.section,
    date: row.payment_date ?? new Date().toISOString().slice(0, 10),
  }));

  if (quarterParam) {
    const quarter = parseInt(quarterParam, 10);
    if (quarter < 1 || quarter > 4 || !Number.isInteger(quarter)) {
      return NextResponse.json({ error: 'quarter must be 1, 2, 3, or 4' }, { status: 400 });
    }

    const summary = computeQuarterlySummary({
      payments,
      quarter: quarter as 1 | 2 | 3 | 4,
      financialYear,
    });

    return NextResponse.json({ financialYear, quarter, summary });
  }

  // Full year summary — aggregate all 4 quarters
  const allQuarters = ([1, 2, 3, 4] as const).flatMap(q =>
    computeQuarterlySummary({ payments, quarter: q, financialYear }),
  );

  // Re-aggregate by vendor+section across full year
  const grouped = new Map<string, (typeof allQuarters)[number]>();
  for (const row of allQuarters) {
    const key = `${row.vendorPAN || row.vendorName}__${row.section}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalPayments = Math.round((existing.totalPayments + row.totalPayments) * 100) / 100;
      existing.totalTDS = Math.round((existing.totalTDS + row.totalTDS) * 100) / 100;
      existing.netPayments = Math.round((existing.netPayments + row.netPayments) * 100) / 100;
    } else {
      grouped.set(key, { ...row });
    }
  }

  return NextResponse.json({ financialYear, quarter: null, summary: Array.from(grouped.values()) });
}
