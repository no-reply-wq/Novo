/**
 * POST /api/runtime/ewaybill/cancel
 * Cancels an existing E-Way Bill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { EWayBillClient } from '@/platform/integrations/ewaybill/client';
import type { EWayBillConfig } from '@/platform/integrations/ewaybill/types';

export const dynamic = 'force-dynamic';

interface RequestBody {
  tableId: string;
  recordId: string;
  cancelRsnCode: number;
  cancelRmrk: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireTenantSession(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tableId, recordId, cancelRsnCode, cancelRmrk } = body as RequestBody;
  if (!tableId || !recordId || !cancelRsnCode || !cancelRmrk) {
    return NextResponse.json(
      { error: 'tableId, recordId, cancelRsnCode, and cancelRmrk are required' },
      { status: 400 }
    );
  }

  const tenantSlug = ctx.tenant.slug;

  // Load EWB config
  const configResult = await pgPool.query<{ config: EWayBillConfig }>(
    `SELECT config FROM platform.ewaybill_configs
     WHERE tenant_slug = $1 AND table_id = $2 AND is_active = true`,
    [tenantSlug, tableId]
  );
  if (configResult.rows.length === 0) {
    return NextResponse.json({ error: 'E-Way Bill not configured for this table' }, { status: 404 });
  }

  // Load existing EWB record
  const ewbResult = await pgPool.query<{ ewb_no: string }>(
    `SELECT ewb_no FROM platform.ewaybill_records
     WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId]
  );
  if (ewbResult.rows.length === 0 || !ewbResult.rows[0].ewb_no) {
    return NextResponse.json({ error: 'No E-Way Bill found for this record' }, { status: 404 });
  }

  const { config } = configResult.rows[0];
  const ewbNo = ewbResult.rows[0].ewb_no;

  const client = new EWayBillClient(config);
  try {
    await client.cancelEWB({ ewbNo, cancelRsnCode, cancelRmrk });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await pgPool.query(
    `UPDATE platform.ewaybill_records
     SET status = 'cancelled'
     WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId]
  );

  return NextResponse.json({ success: true });
}
