/**
 * POST /api/runtime/ewaybill/generate
 * Generates an E-Way Bill for a given record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { EWayBillClient } from '@/platform/integrations/ewaybill/client';
import { mapRecordToEWBPayload } from '@/platform/integrations/ewaybill/mapper';
import type { EWayBillConfig, EWayBillFieldMapping } from '@/platform/integrations/ewaybill/types';

export const dynamic = 'force-dynamic';

interface RequestBody {
  tableId: string;
  recordId: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tableId, recordId } = body as RequestBody;
  if (!tableId || !recordId) {
    return NextResponse.json({ error: 'tableId and recordId are required' }, { status: 400 });
  }

  const tenantSlug = ctx.tenant.slug;

  // Load EWB config
  const configResult = await pgPool.query<{ config: EWayBillConfig; field_mapping: EWayBillFieldMapping }>(
    `SELECT config, field_mapping FROM platform.ewaybill_configs
     WHERE tenant_slug = $1 AND table_id = $2 AND is_active = true`,
    [tenantSlug, tableId]
  );

  if (configResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'E-Way Bill not configured for this table' },
      { status: 404 }
    );
  }

  const { config, field_mapping: fieldMapping } = configResult.rows[0];

  // Load record
  const recordResult = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM "${ctx.schemaName}".records WHERE id = $1`,
    [recordId]
  );

  if (recordResult.rows.length === 0) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const record = recordResult.rows[0];

  // Load line items
  let lineItems: Record<string, unknown>[] = [];
  if (fieldMapping.itemsTableId) {
    const lineResult = await pgPool.query<Record<string, unknown>>(
      `SELECT * FROM "${ctx.schemaName}".records
       WHERE table_id = $1 AND parent_id = $2`,
      [fieldMapping.itemsTableId, recordId]
    );
    lineItems = lineResult.rows;
  }

  // Map to EWB payload
  let ewbPayload;
  try {
    ewbPayload = mapRecordToEWBPayload({ record, lineItems, mapping: fieldMapping, config });
  } catch (err) {
    return NextResponse.json(
      { error: `Payload mapping failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 }
    );
  }

  // Call NIC API
  const client = new EWayBillClient(config);
  let ewbResponse;
  try {
    ewbResponse = await client.generateEWB(ewbPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record error
    await pgPool.query(
      `INSERT INTO platform.ewaybill_records
         (tenant_slug, record_id, table_id, status, error_message)
       VALUES ($1, $2, $3, 'error', $4)
       ON CONFLICT (tenant_slug, record_id)
       DO UPDATE SET status = 'error', error_message = $4`,
      [tenantSlug, recordId, tableId, message]
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Persist EWB record
  await pgPool.query(
    `INSERT INTO platform.ewaybill_records
       (tenant_slug, record_id, table_id, ewb_no, ewb_dt, ewb_valid_till, status, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'generated', now())
     ON CONFLICT (tenant_slug, record_id)
     DO UPDATE SET ewb_no = $4, ewb_dt = $5, ewb_valid_till = $6, status = 'generated', generated_at = now(), error_message = null`,
    [tenantSlug, recordId, tableId, ewbResponse.ewbNo, ewbResponse.ewbDt, ewbResponse.ewbValidTill]
  );

  return NextResponse.json({ success: true, ewb: ewbResponse });
}
