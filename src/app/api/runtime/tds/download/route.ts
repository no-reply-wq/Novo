/**
 * Runtime TDS Download API
 * GET /api/runtime/tds/download?tenantSlug=...&appId=...&financialYear=...&quarter=1|2|3|4
 *
 * Returns CSV download of TDS summary compatible with TRACES portal import.
 * Format: Deductee PAN, Name, Section, Payment Amount, TDS Amount, Net Amount, Quarter
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';

export const dynamic = 'force-dynamic';

interface TDSRecordRow {
  vendor_name: string | null;
  vendor_pan: string | null;
  section: string;
  gross_amount: string;
  tds_rate: string;
  tds_amount: string;
  net_amount: string;
  financial_year: string;
  quarter: number | null;
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
  const perm = await requirePermission(ctx, MODULE.PURCHASE, 'view');
  if (perm instanceof NextResponse) return perm;

  const fyStartYear = parseInt(financialYear.split('-')[0] ?? '2024', 10);
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const queryParams: (string | number)[] = [tenantSlug, financialYear, fyStart, fyEnd];
  let quarterFilter = '';
  if (quarterParam) {
    const q = parseInt(quarterParam, 10);
    if (q < 1 || q > 4 || !Number.isInteger(q)) {
      return NextResponse.json({ error: 'quarter must be 1, 2, 3, or 4' }, { status: 400 });
    }
    queryParams.push(q);
    quarterFilter = `AND quarter = $${queryParams.length}`;
  }

  const result = await pgPool.query<TDSRecordRow>(
    `SELECT vendor_name, vendor_pan, section, gross_amount, tds_rate, tds_amount,
            net_amount, financial_year, quarter, payment_date
     FROM platform.tds_records
     WHERE tenant_slug = $1 AND financial_year = $2
       AND (payment_date IS NULL OR payment_date BETWEEN $3 AND $4)
       ${quarterFilter}
     ORDER BY payment_date ASC, vendor_name ASC`,
    queryParams,
  );

  const lines: string[] = [
    // TRACES 26Q-compatible header
    'Deductee PAN,Deductee Name,Section Code,Payment Amount (INR),TDS Rate (%),TDS Amount (INR),Net Amount (INR),Financial Year,Quarter,Payment Date',
  ];

  for (const row of result.rows) {
    lines.push([
      csvEscape(row.vendor_pan ?? ''),
      csvEscape(row.vendor_name ?? ''),
      csvEscape(row.section),
      row.gross_amount,
      row.tds_rate,
      row.tds_amount,
      row.net_amount,
      csvEscape(row.financial_year),
      row.quarter !== null ? String(row.quarter) : '',
      csvEscape(row.payment_date ?? ''),
    ].join(','));
  }

  const csv = lines.join('\r\n');
  const filename = quarterParam
    ? `tds_26q_${financialYear}_Q${quarterParam}.csv`
    : `tds_26q_${financialYear}_full.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
