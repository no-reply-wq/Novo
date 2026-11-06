/**
 * POST /api/builder/integrations/tally/export
 * Export records as a Tally-compatible XML file.
 * Body: { tenantSlug, tableId, filters?, mapping, config? }
 * Returns: XML file download
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { generateTallyXml, recordToVoucher } from '@/platform/integrations/tally/exporter';
import type { TallyVoucherMapping, TallyExportConfig } from '@/platform/integrations/tally/types';

const LedgerMappingSchema = z.object({
  ledgerName: z.string().min(1),
  amountExpression: z.string().min(1),
});

const MappingSchema = z.object({
  dateField: z.string().min(1),
  voucherNumberField: z.string().min(1),
  partyField: z.string().min(1),
  amountField: z.string().min(1),
  voucherType: z.enum(['Sales', 'Purchase', 'Receipt', 'Payment', 'Journal']),
  ledgerMappings: z.array(LedgerMappingSchema).min(1),
});

const ExportSchema = z.object({
  tenantSlug: z.string().min(1),
  tableId: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
  mapping: MappingSchema,
  config: z.object({
    companyName: z.string().default('Company'),
    financialYear: z.string().default('2024-25'),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, tableId, mapping, config } = parsed.data;

  // Verify tenant access
  const userTenantSlug = (session.user as { tenantSlug?: string }).tenantSlug;
  const isPlatformAdmin = (session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin;
  if (!isPlatformAdmin && userTenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Look up the table's API key to build the schema-qualified table name
  const tableRes = await pgPool.query<{ api_key: string; app_id: string }>(
    `SELECT t.api_key, t.app_id
     FROM platform.tables t
     JOIN public.apps a ON a.id = t.app_id
     WHERE t.id = $1 AND a.tenant_slug = $2`,
    [tableId, tenantSlug]
  );

  if (tableRes.rowCount === 0) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const { api_key: apiKey, app_id: appId } = tableRes.rows[0];
  const schemaName = `tenant_${tenantSlug}`;
  const fullTableName = `${schemaName}.t_${appId.replace(/-/g, '_')}_${apiKey}`;

  // Fetch records (simple SELECT; production would apply filters)
  const recordsRes = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM ${fullTableName} ORDER BY created_at DESC LIMIT 10000`
  );

  const typedMapping: TallyVoucherMapping = {
    dateField: mapping.dateField,
    voucherNumberField: mapping.voucherNumberField,
    partyField: mapping.partyField,
    amountField: mapping.amountField,
    voucherType: mapping.voucherType,
    ledgerMappings: mapping.ledgerMappings,
  };

  const tallyConfig: TallyExportConfig = {
    companyName: config?.companyName ?? 'Company',
    financialYear: config?.financialYear ?? '2024-25',
    exportFormat: 'xml',
  };

  const vouchers = recordsRes.rows.map((row: Record<string, unknown>) => recordToVoucher(row, typedMapping));
  const xml = generateTallyXml({ vouchers, config: tallyConfig });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename=tally-export.xml',
    },
  });
}
