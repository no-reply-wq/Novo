/**
 * Builder TDS Config API
 * GET  /api/builder/integrations/tds/config?tenantSlug=...&appId=...
 * POST /api/builder/integrations/tds/config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import type { TDSConfig } from '@/platform/integrations/tds/types';

const VendorFieldMappingSchema = z.object({
  name: z.string().min(1),
  pan: z.string().min(1),
  vendorType: z.string().min(1),
  tdsSection: z.string().min(1),
  tdsExempt: z.string().min(1),
});

const PaymentFieldMappingSchema = z.object({
  vendorId: z.string().min(1),
  amount: z.string().min(1),
  date: z.string().min(1),
  tdsAmount: z.string().min(1),
  tdsSection: z.string().min(1),
  netAmount: z.string().min(1),
});

const TDSConfigSchema = z.object({
  tenantSlug: z.string().min(1),
  appId: z.string().uuid(),
  config: z.object({
    deductorGSTIN: z.string().min(1),
    deductorPAN: z.string().min(1),
    deductorName: z.string().min(1),
    deductorType: z.enum(['company', 'individual', 'government']),
    financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Must be in format YYYY-YY'),
    vendorTableId: z.string().min(1),
    vendorFieldMapping: VendorFieldMappingSchema,
    paymentTableId: z.string().min(1),
    paymentFieldMapping: PaymentFieldMappingSchema,
  }),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenantSlug') ?? '';
  const appId = searchParams.get('appId') ?? '';

  if (!tenantSlug || !appId) {
    return NextResponse.json({ error: 'tenantSlug and appId are required' }, { status: 400 });
  }

  const authError = await authorize(tenantSlug);
  if (authError) return authError;

  const { rows } = await pgPool.query<{ id: string; config: TDSConfig; created_at: string }>(
    `SELECT id, config, created_at FROM platform.tds_configs WHERE tenant_slug = $1 AND app_id = $2`,
    [tenantSlug, appId],
  );

  if (rows.length === 0) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({ id: rows[0]?.id, config: rows[0]?.config, createdAt: rows[0]?.created_at });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TDSConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, appId, config } = parsed.data;

  const authError = await authorize(tenantSlug);
  if (authError) return authError;

  const { rows } = await pgPool.query<{ id: string; config: TDSConfig; created_at: string }>(
    `INSERT INTO platform.tds_configs (tenant_slug, app_id, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_slug, app_id)
     DO UPDATE SET config = EXCLUDED.config
     RETURNING id, config, created_at`,
    [tenantSlug, appId, JSON.stringify(config)],
  );

  return NextResponse.json({ id: rows[0]?.id, config: rows[0]?.config, createdAt: rows[0]?.created_at }, { status: 200 });
}
