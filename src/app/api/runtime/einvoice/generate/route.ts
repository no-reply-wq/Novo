/**
 * Runtime: Generate E-Invoice IRN
 * POST /api/runtime/einvoice/generate
 * Body: { tenantSlug, tableId, recordId }
 *
 * Flow:
 * 1. Load einvoice_configs (config + field mapping)
 * 2. Fetch invoice record from tenant schema
 * 3. Fetch line items from related table
 * 4. Map to IRP payload
 * 5. Call IRPClient.generateIRN()
 * 6. Save IRN/QR to einvoice_records
 * 7. Update the invoice record with irn, ack_no, ack_dt fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';
import { pgPool, tenantQuery } from '@/lib/db/client';
import { decryptSecret } from '@/platform/integrations/secrets';
import { IRPClient } from '@/platform/integrations/einvoice/client';
import { mapRecordToPayload } from '@/platform/integrations/einvoice/mapper';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { EInvoiceConfig, EInvoiceFieldMapping } from '@/platform/integrations/einvoice/types';

export const dynamic = 'force-dynamic';

interface ConfigRow {
  config: EInvoiceConfig;
  field_mapping: EInvoiceFieldMapping;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantSlug, tableId, recordId } = body as {
    tenantSlug?: string;
    tableId?: string;
    recordId?: string;
  };

  if (!tenantSlug || !tableId || !recordId) {
    return NextResponse.json({ error: 'Missing tenantSlug, tableId, or recordId' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const perm = await requirePermission(ctx, MODULE.SALES_ORDERS, 'view');
  if (perm instanceof NextResponse) return perm;

  // 1. Load config
  const configResult = await pgPool.query<ConfigRow>(
    `SELECT config, field_mapping
     FROM platform.einvoice_configs
     WHERE tenant_slug = $1 AND table_id = $2 AND is_active = true`,
    [tenantSlug, tableId],
  );

  if (configResult.rows.length === 0) {
    throw new NotConfiguredError(`No active e-invoice config for table ${tableId} in tenant ${tenantSlug}`);
  }

  const { config: rawConfig, field_mapping: mapping } = configResult.rows[0];

  // Decrypt password
  const decryptedPassword = decryptSecret(rawConfig.password, tenantSlug);
  const config: EInvoiceConfig = { ...rawConfig, password: decryptedPassword };

  // 2. Fetch invoice record
  const invoiceRows = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM records WHERE table_id = $1 AND id = $2 LIMIT 1`,
    [tableId, recordId],
  );

  if (invoiceRows.rows.length === 0) {
    return NextResponse.json({ error: 'Invoice record not found' }, { status: 404 });
  }

  const invoiceRecord = invoiceRows.rows[0];

  // 3. Fetch line items
  const lineItemsTableId = mapping.itemsTableId;
  const lineItemRows = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT * FROM records WHERE table_id = $1 AND parent_record_id = $2`,
    [lineItemsTableId, recordId],
  );

  const lineItems = lineItemRows.rows;

  // 4. Map to IRP payload
  const payload = mapRecordToPayload({
    invoiceRecord,
    lineItems,
    mapping,
    sellerGstin: config.gstin,
    sellerName: String(invoiceRecord['seller_name'] ?? ''),
    sellerAddress: String(invoiceRecord['seller_address'] ?? ''),
    sellerCity: String(invoiceRecord['seller_city'] ?? ''),
    sellerPincode: String(invoiceRecord['seller_pincode'] ?? ''),
    sellerStateCode: String(invoiceRecord['seller_state_code'] ?? ''),
  });

  // Check if IRN already exists
  const existingResult = await pgPool.query<{ irn: string; status: string }>(
    `SELECT irn, status FROM platform.einvoice_records
     WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId],
  );

  if (existingResult.rows.length > 0 && existingResult.rows[0].status === 'generated') {
    return NextResponse.json({ error: 'IRN already generated for this record' }, { status: 409 });
  }

  // 5. Call IRP
  const client = new IRPClient(config);
  let eiResponse;
  try {
    eiResponse = await client.generateIRN(payload);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Upsert error record
    await pgPool.query(
      `INSERT INTO platform.einvoice_records (tenant_slug, record_id, table_id, status, error_message)
       VALUES ($1, $2, $3, 'error', $4)
       ON CONFLICT (tenant_slug, record_id) DO UPDATE SET
         status = 'error', error_message = EXCLUDED.error_message`,
      [tenantSlug, recordId, tableId, errorMessage],
    );

    return NextResponse.json({ error: `IRP error: ${errorMessage}` }, { status: 502 });
  }

  // 6. Save to einvoice_records
  await pgPool.query(
    `INSERT INTO platform.einvoice_records
       (tenant_slug, record_id, table_id, irn, ack_no, ack_dt, signed_qr, status, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'generated', NOW())
     ON CONFLICT (tenant_slug, record_id) DO UPDATE SET
       irn = EXCLUDED.irn,
       ack_no = EXCLUDED.ack_no,
       ack_dt = EXCLUDED.ack_dt,
       signed_qr = EXCLUDED.signed_qr,
       status = 'generated',
       error_message = NULL,
       generated_at = NOW()`,
    [tenantSlug, recordId, tableId, eiResponse.irn, eiResponse.ackNo, eiResponse.ackDt, eiResponse.signedQrCode],
  );

  // 7. Update invoice record with IRN data
  await tenantQuery(
    ctx.schemaName,
    `UPDATE records SET
       irn = $1, ack_no = $2, ack_dt = $3
     WHERE table_id = $4 AND id = $5`,
    [eiResponse.irn, eiResponse.ackNo, eiResponse.ackDt, tableId, recordId],
  );

  return NextResponse.json(eiResponse, { status: 200 });
}
