/**
 * Runtime TDS Calculate API
 * POST /api/runtime/tds/calculate
 *
 * Body: { tenantSlug, appId, paymentRecordId, vendorId, amount }
 * 1. Load TDS config
 * 2. Fetch vendor record (get PAN, type, section)
 * 3. Get YTD payments for this vendor+section
 * 4. Run calculateTDS()
 * 5. Update payment record fields (tdsAmount, netAmount, section)
 * 6. Save to tds_records
 * Returns: TDSCalculationResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool, tenantQuery } from '@/lib/db/client';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';
import { calculateTDS } from '@/platform/integrations/tds/calculator';
import type { TDSConfig } from '@/platform/integrations/tds/types';
import type { TDSCalculationResult } from '@/platform/integrations/tds/calculator';

export const dynamic = 'force-dynamic';

interface RequestBody {
  tenantSlug: string;
  appId: string;
  paymentRecordId: string;
  vendorId: string;
  amount: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantSlug, appId, paymentRecordId, vendorId, amount } = body as RequestBody;

  if (!tenantSlug || !appId || !paymentRecordId || !vendorId || typeof amount !== 'number') {
    return NextResponse.json({ error: 'tenantSlug, appId, paymentRecordId, vendorId, and amount are required' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const perm = await requirePermission(ctx, MODULE.PURCHASE, 'view');
  if (perm instanceof NextResponse) return perm;

  // 1. Load TDS config
  const configResult = await pgPool.query<{ config: TDSConfig }>(
    `SELECT config FROM platform.tds_configs WHERE tenant_slug = $1 AND app_id = $2`,
    [tenantSlug, appId],
  );

  if (configResult.rows.length === 0) {
    return NextResponse.json({ error: 'TDS not configured for this app' }, { status: 404 });
  }

  const tdsConfig = configResult.rows[0]?.config;
  if (!tdsConfig) {
    return NextResponse.json({ error: 'TDS config is empty' }, { status: 500 });
  }

  // 2. Fetch vendor record
  const vendorResult = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM "${tdsConfig.vendorTableId}" WHERE id = $1 LIMIT 1`,
    [vendorId],
  );

  if (vendorResult.rows.length === 0) {
    return NextResponse.json({ error: `Vendor "${vendorId}" not found` }, { status: 404 });
  }

  const vendor = vendorResult.rows[0] as Record<string, unknown>;
  const { vendorFieldMapping } = tdsConfig;

  const vendorPAN = typeof vendor[vendorFieldMapping.pan] === 'string'
    ? (vendor[vendorFieldMapping.pan] as string)
    : '';

  const vendorTypeRaw = typeof vendor[vendorFieldMapping.vendorType] === 'string'
    ? (vendor[vendorFieldMapping.vendorType] as string).toLowerCase()
    : '';

  const vendorType: 'individual' | 'huf' | 'company' | 'other' =
    vendorTypeRaw === 'individual' ? 'individual'
    : vendorTypeRaw === 'huf' ? 'huf'
    : vendorTypeRaw === 'company' ? 'company'
    : 'other';

  const tdsSection = typeof vendor[vendorFieldMapping.tdsSection] === 'string'
    ? (vendor[vendorFieldMapping.tdsSection] as string)
    : '';

  if (!tdsSection) {
    return NextResponse.json({ error: 'Vendor has no TDS section configured' }, { status: 422 });
  }

  // Check TDS exemption
  const tdsExempt = vendor[vendorFieldMapping.tdsExempt];
  if (tdsExempt === true || tdsExempt === 'true' || tdsExempt === 1) {
    const result: TDSCalculationResult = {
      grossAmount: amount,
      tdsRate: 0,
      tdsAmount: 0,
      netAmount: amount,
      section: tdsSection,
      thresholdApplied: true,
      reason: 'Vendor is marked as TDS exempt.',
    };
    return NextResponse.json(result);
  }

  // 3. Get YTD payments for this vendor + section
  const { financialYear } = tdsConfig;
  const fyStartYear = parseInt(financialYear.split('-')[0] ?? '2024', 10);
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const ytdResult = await pgPool.query<{ total: string }>(
    `SELECT COALESCE(SUM(gross_amount), 0)::text AS total
     FROM platform.tds_records
     WHERE tenant_slug = $1 AND vendor_id = $2 AND section = $3
       AND payment_date BETWEEN $4 AND $5`,
    [tenantSlug, vendorId, tdsSection, fyStart, fyEnd],
  );

  const ytdPayments = parseFloat(ytdResult.rows[0]?.total ?? '0');

  // 4. Run calculateTDS
  const result = calculateTDS({
    amount,
    section: tdsSection,
    vendorType,
    hasPAN: vendorPAN.length >= 10,
    financialYear,
    ytdPayments,
  });

  // 5. Update payment record fields
  const { paymentFieldMapping } = tdsConfig;
  await tenantQuery(
    ctx.schemaName,
    `UPDATE "${tdsConfig.paymentTableId}"
     SET "${paymentFieldMapping.tdsAmount}" = $1,
         "${paymentFieldMapping.netAmount}" = $2,
         "${paymentFieldMapping.tdsSection}" = $3
     WHERE id = $4`,
    [result.tdsAmount, result.netAmount, result.section, paymentRecordId],
  );

  // 6. Save to tds_records
  const paymentDateRow = await tenantQuery<{ payment_date: string | null }>(
    ctx.schemaName,
    `SELECT "${paymentFieldMapping.date}" AS payment_date FROM "${tdsConfig.paymentTableId}" WHERE id = $1 LIMIT 1`,
    [paymentRecordId],
  );

  const paymentDate = paymentDateRow.rows[0]?.payment_date ?? null;
  const quarter = paymentDate ? dateToQuarter(new Date(paymentDate)) : null;

  await pgPool.query(
    `INSERT INTO platform.tds_records
       (tenant_slug, payment_record_id, vendor_id, vendor_name, vendor_pan, section,
        gross_amount, tds_rate, tds_amount, net_amount, financial_year, quarter, payment_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      tenantSlug, paymentRecordId, vendorId,
      vendor[vendorFieldMapping.name] ?? null,
      vendorPAN || null,
      result.section, result.grossAmount, result.tdsRate,
      result.tdsAmount, result.netAmount, financialYear,
      quarter, paymentDate,
    ],
  );

  return NextResponse.json(result);
}

function dateToQuarter(d: Date): 1 | 2 | 3 | 4 {
  const month = d.getMonth(); // 0-indexed
  if (month >= 3 && month <= 5) return 1;  // Apr–Jun
  if (month >= 6 && month <= 8) return 2;  // Jul–Sep
  if (month >= 9 && month <= 11) return 3; // Oct–Dec
  return 4;                                 // Jan–Mar
}
