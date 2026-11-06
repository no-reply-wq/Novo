/**
 * GST R1 Generate — Runtime API
 * POST /api/runtime/gstr1/generate
 * Body: { tenantSlug, appId, month: number, year: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool, tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import type { GSTR1Config } from '@/platform/integrations/gstr1/types';
import { aggregateGSTR1 } from '@/platform/integrations/gstr1/aggregator';

export const dynamic = 'force-dynamic';

const GenerateSchema = z.object({
  tenantSlug: z.string().min(1),
  appId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2017).max(2099),
});

async function authorize(tenantSlug: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { tenantSlug, appId, month, year } = parsed.data;

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  // 1. Load GST R1 config
  const cfgResult = await pgPool.query<{ config: GSTR1Config }>(
    `SELECT config FROM platform.gstr1_configs WHERE tenant_slug = $1 AND app_id = $2`,
    [tenantSlug, appId]
  );

  if (cfgResult.rows.length === 0) {
    return NextResponse.json({ error: 'GSTR1 config not found. Please configure the integration first.' }, { status: 404 });
  }

  const config = cfgResult.rows[0].config;

  // 2. Fetch all invoices for the period from tenant schema
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  const tableId = config.invoiceTableId;

  const invoicesResult = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT * FROM ${schemaName}.${tableId}`
  );

  const invoices = invoicesResult.rows;

  // 3. Run aggregation
  const sellerStateCode = config.gstin.substring(0, 2);
  const gstr1 = aggregateGSTR1({
    invoices,
    config,
    period: { month, year },
    sellerStateCode,
  });

  // 4. Compute summary totals
  let totalTaxableValue = 0;
  let totalTax = 0;
  let invoiceCount = 0;

  for (const buyer of gstr1.b2b) {
    for (const inv of buyer.inv) {
      invoiceCount++;
      for (const itm of inv.itms) {
        totalTaxableValue += itm.itm_det.txval;
        totalTax += (itm.itm_det.iamt ?? 0) + (itm.itm_det.camt ?? 0) + (itm.itm_det.samt ?? 0) + (itm.itm_det.csamt ?? 0);
      }
    }
  }
  for (const posGroup of gstr1.b2cl) {
    for (const inv of posGroup.inv) {
      invoiceCount++;
      for (const itm of inv.itms) {
        totalTaxableValue += itm.itm_det.txval;
        totalTax += itm.itm_det.iamt + (itm.itm_det.csamt ?? 0);
      }
    }
  }
  for (const s of gstr1.b2cs) {
    totalTaxableValue += s.txval;
    totalTax += (s.iamt ?? 0) + (s.camt ?? 0) + (s.samt ?? 0) + (s.csamt ?? 0);
  }

  const fp = `${String(month).padStart(2, '0')}${year}`;

  // 5. Save to gstr1_filings
  const filingResult = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.gstr1_filings
       (tenant_slug, period, status, summary, invoice_count, total_taxable_value, total_tax, generated_at)
     VALUES ($1, $2, 'draft', $3, $4, $5, $6, now())
     ON CONFLICT (tenant_slug, period)
     DO UPDATE SET
       status = 'draft',
       summary = $3,
       invoice_count = $4,
       total_taxable_value = $5,
       total_tax = $6,
       generated_at = now()
     RETURNING id`,
    [tenantSlug, fp, JSON.stringify(gstr1), invoiceCount, totalTaxableValue, totalTax]
  );

  const filingId = filingResult.rows[0]?.id;

  return NextResponse.json({
    filingId,
    period: fp,
    summary: {
      b2bCount: gstr1.b2b.length,
      b2clCount: gstr1.b2cl.length,
      b2csCount: gstr1.b2cs.length,
      cdnrCount: gstr1.cdnr.length,
      hsnCount: gstr1.hsn.length,
      invoiceCount,
      totalTaxableValue,
      totalTax,
    },
  });
}
