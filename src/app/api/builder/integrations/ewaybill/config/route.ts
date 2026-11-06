/**
 * GET  /api/builder/integrations/ewaybill/config?tenantSlug=&tableId=
 * POST /api/builder/integrations/ewaybill/config
 *
 * Manages E-Way Bill builder configuration per tenant+table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import type { EWayBillConfig, EWayBillFieldMapping } from '@/platform/integrations/ewaybill/types';
import { EWayBillClient } from '@/platform/integrations/ewaybill/client';

export const dynamic = 'force-dynamic';

const PostSchema = z.object({
  tenantSlug: z.string().min(1),
  appId: z.string().uuid(),
  tableId: z.string().uuid(),
  config: z.object({
    gstin: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    sandbox: z.boolean(),
  }),
  fieldMapping: z.record(z.string(), z.string()),
  testConnection: z.boolean().optional(),
});

async function authorize(tenantSlug: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = session.user as { isPlatformAdmin?: boolean; tenantSlug?: string };
  if (!user.isPlatformAdmin && user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenantSlug') ?? '';
  const tableId = searchParams.get('tableId') ?? '';

  if (!tenantSlug || !tableId) {
    return NextResponse.json({ error: 'tenantSlug and tableId are required' }, { status: 400 });
  }

  const deny = await authorize(tenantSlug);
  if (deny) return deny;

  const result = await pgPool.query<{
    id: string;
    config: EWayBillConfig;
    field_mapping: EWayBillFieldMapping;
    is_active: boolean;
  }>(
    `SELECT id, config, field_mapping, is_active
     FROM platform.ewaybill_configs
     WHERE tenant_slug = $1 AND table_id = $2`,
    [tenantSlug, tableId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null });
  }

  const row = result.rows[0];
  // Mask password
  const safeConfig = { ...row.config, password: '***' };
  return NextResponse.json({
    id: row.id,
    config: safeConfig,
    fieldMapping: row.field_mapping,
    isActive: row.is_active,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { tenantSlug, appId, tableId, config, fieldMapping, testConnection } = parsed.data;

  const deny = await authorize(tenantSlug);
  if (deny) return deny;

  // Optionally test connection before saving
  if (testConnection) {
    try {
      const client = new EWayBillClient(config as EWayBillConfig);
      await client.authenticate();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Connection test failed: ${message}` }, { status: 422 });
    }
  }

  await pgPool.query(
    `INSERT INTO platform.ewaybill_configs
       (tenant_slug, app_id, table_id, config, field_mapping, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (tenant_slug, table_id)
     DO UPDATE SET app_id = $2, config = $4, field_mapping = $5, is_active = true`,
    [tenantSlug, appId, tableId, JSON.stringify(config), JSON.stringify(fieldMapping)]
  );

  return NextResponse.json({ success: true });
}
