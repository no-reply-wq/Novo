/**
 * GST R1 Config — Builder API
 * GET  /api/builder/integrations/gstr1/config?tenant=slug&appId=uuid
 * POST /api/builder/integrations/gstr1/config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import type { GSTR1Config } from '@/platform/integrations/gstr1/types';

export const dynamic = 'force-dynamic';

const FieldMappingSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  invoiceType: z.string(),
  buyerGstin: z.string(),
  buyerName: z.string(),
  buyerStateCode: z.string(),
  placeOfSupply: z.string(),
  reverseCharge: z.string(),
  invoiceValue: z.string(),
  taxableValue: z.string(),
  igstAmount: z.string(),
  cgstAmount: z.string(),
  sgstAmount: z.string(),
  cessAmount: z.string(),
  hsnCode: z.string(),
  itemDescription: z.string(),
});

const ConfigSchema = z.object({
  tenantSlug: z.string().min(1),
  appId: z.string().uuid(),
  config: z.object({
    gstin: z.string().length(15),
    legalName: z.string().min(1),
    invoiceTableId: z.string(),
    fieldMapping: FieldMappingSchema,
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
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  const appId = req.nextUrl.searchParams.get('appId') ?? '';

  if (!tenantSlug || !appId) {
    return NextResponse.json({ error: 'Missing tenant or appId parameter' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<{ config: GSTR1Config }>(
    `SELECT config FROM platform.gstr1_configs
     WHERE tenant_slug = $1 AND app_id = $2`,
    [tenantSlug, appId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({ config: result.rows[0].config });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { tenantSlug, appId, config } = parsed.data;

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  await pgPool.query(
    `INSERT INTO platform.gstr1_configs (tenant_slug, app_id, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_slug, app_id)
     DO UPDATE SET config = $3`,
    [tenantSlug, appId, JSON.stringify(config)]
  );

  return NextResponse.json({ ok: true });
}
