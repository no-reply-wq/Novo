/**
 * GST R1 Filing History — Runtime API
 * GET /api/runtime/gstr1/history
 *
 * Returns the authenticated tenant's past GSTR1 generations (newest first).
 * Tenant is derived from the session — the ?tenant= / ?appId= query params the
 * client sends are ignored for authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface FilingRow {
  id: string;
  period: string;
  status: string;
  invoice_count: number | null;
  total_taxable_value: string | null;
  total_tax: string | null;
  generated_at: string | null;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  // Defensive: the gstr1_filings table ships in migration 020, but create it if
  // it is somehow absent so the endpoint degrades to an empty list rather than 500.
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS platform.gstr1_filings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_slug text NOT NULL,
      period text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      summary jsonb,
      invoice_count integer,
      total_taxable_value numeric,
      total_tax numeric,
      generated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_slug, period)
    )
  `);

  const result = await pgPool.query<FilingRow>(
    `SELECT id, period, status, invoice_count, total_taxable_value, total_tax, generated_at
       FROM platform.gstr1_filings
      WHERE tenant_slug = $1
      ORDER BY period DESC, generated_at DESC NULLS LAST`,
    [ctx.tenant.slug],
  );

  return NextResponse.json({ filings: result.rows }, { status: 200 });
}
