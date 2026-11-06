/**
 * Runtime: Cancel E-Invoice IRN
 * POST /api/runtime/einvoice/cancel
 * Body: { tenantSlug, tableId, recordId, reason, remarks }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '@/platform/integrations/secrets';
import { IRPClient } from '@/platform/integrations/einvoice/client';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { EInvoiceConfig } from '@/platform/integrations/einvoice/types';

export const dynamic = 'force-dynamic';

interface ConfigRow {
  config: EInvoiceConfig;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantSlug, tableId, recordId, reason, remarks } = body as {
    tenantSlug?: string;
    tableId?: string;
    recordId?: string;
    reason?: number;
    remarks?: string;
  };

  if (!tenantSlug || !tableId || !recordId) {
    return NextResponse.json({ error: 'Missing tenantSlug, tableId, or recordId' }, { status: 400 });
  }

  if (reason === undefined) {
    return NextResponse.json({ error: 'Missing reason code' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  // Load einvoice record
  const recordResult = await pgPool.query<{ irn: string; status: string }>(
    `SELECT irn, status FROM platform.einvoice_records
     WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId],
  );

  if (recordResult.rows.length === 0) {
    return NextResponse.json({ error: 'E-Invoice record not found' }, { status: 404 });
  }

  const { irn, status } = recordResult.rows[0];

  if (status === 'cancelled') {
    return NextResponse.json({ error: 'IRN already cancelled' }, { status: 409 });
  }

  if (status !== 'generated' || !irn) {
    return NextResponse.json({ error: 'IRN has not been generated yet' }, { status: 400 });
  }

  // Load config
  const configResult = await pgPool.query<ConfigRow>(
    `SELECT config
     FROM platform.einvoice_configs
     WHERE tenant_slug = $1 AND table_id = $2 AND is_active = true`,
    [tenantSlug, tableId],
  );

  if (configResult.rows.length === 0) {
    throw new NotConfiguredError(`No active e-invoice config for table ${tableId} in tenant ${tenantSlug}`);
  }

  const rawConfig = configResult.rows[0].config;
  const decryptedPassword = decryptSecret(rawConfig.password, tenantSlug);
  const config: EInvoiceConfig = { ...rawConfig, password: decryptedPassword };

  // Cancel via IRP
  const client = new IRPClient(config);
  try {
    await client.cancelIRN(irn, reason, remarks ?? '');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `IRP cancel error: ${errorMessage}` }, { status: 502 });
  }

  // Update record
  await pgPool.query(
    `UPDATE platform.einvoice_records SET status = 'cancelled' WHERE tenant_slug = $1 AND record_id = $2`,
    [tenantSlug, recordId],
  );

  return NextResponse.json({ cancelled: true });
}
