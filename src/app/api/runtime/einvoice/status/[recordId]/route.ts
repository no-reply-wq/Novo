/**
 * Runtime: Get E-Invoice status for a record
 * GET /api/runtime/einvoice/status/[recordId]?tenant=slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

interface EInvoiceRecordRow {
  id: string;
  record_id: string;
  table_id: string;
  irn: string | null;
  ack_no: string | null;
  ack_dt: string | null;
  signed_qr: string | null;
  status: string;
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
}

type Params = { params: Promise<{ recordId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { recordId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const perm = await requirePermission(ctx, MODULE.SALES_ORDERS, 'view');
  if (perm instanceof NextResponse) return perm;

  const result = await pgPool.query<EInvoiceRecordRow>(
    `SELECT id, record_id, table_id, irn, ack_no, ack_dt, signed_qr, status, error_message, generated_at, created_at
     FROM platform.einvoice_records
     WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ status: 'pending', irn: null });
  }

  const row = result.rows[0];

  return NextResponse.json({
    id: row.id,
    recordId: row.record_id,
    tableId: row.table_id,
    irn: row.irn,
    ackNo: row.ack_no,
    ackDt: row.ack_dt,
    signedQr: row.signed_qr,
    status: row.status,
    errorMessage: row.error_message,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  });
}
