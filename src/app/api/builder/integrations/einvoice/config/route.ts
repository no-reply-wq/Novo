/**
 * Builder: E-Invoice config API
 * GET  /api/builder/integrations/einvoice/config?tenant=slug&tableId=uuid
 * POST /api/builder/integrations/einvoice/config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { encryptSecret } from '@/platform/integrations/secrets';
import type { EInvoiceConfig, EInvoiceFieldMapping } from '@/platform/integrations/einvoice/types';

const FieldMappingSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  buyerGstin: z.string(),
  buyerName: z.string(),
  buyerAddress: z.string(),
  buyerCity: z.string(),
  buyerPincode: z.string(),
  buyerStateCode: z.string(),
  itemsTableId: z.string(),
  itemDescription: z.string(),
  itemHsn: z.string(),
  itemQty: z.string(),
  itemUnit: z.string(),
  itemRate: z.string(),
  itemTaxableAmount: z.string(),
  itemGstRate: z.string(),
  totalTaxableAmount: z.string(),
  totalGst: z.string(),
  totalInvoiceAmount: z.string(),
});

const PostSchema = z.object({
  tenantSlug: z.string().min(1),
  appId: z.string().uuid(),
  tableId: z.string().uuid(),
  config: z.object({
    gstin: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    sandbox: z.boolean(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  fieldMapping: FieldMappingSchema,
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

interface DbConfigRow {
  id: string;
  tenant_slug: string;
  app_id: string;
  table_id: string;
  config: EInvoiceConfig;
  field_mapping: EInvoiceFieldMapping;
  is_active: boolean;
  created_at: Date;
}

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  const tableId = req.nextUrl.searchParams.get('tableId') ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<DbConfigRow>(
    `SELECT id, tenant_slug, app_id, table_id, config, field_mapping, is_active, created_at
     FROM platform.einvoice_configs
     WHERE tenant_slug = $1${tableId ? ' AND table_id = $2' : ''}`,
    tableId ? [tenantSlug, tableId] : [tenantSlug],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null });
  }

  const row = result.rows[0];
  // Mask password
  const safeConfig = { ...row.config, password: '****' };

  return NextResponse.json({
    config: {
      id: row.id,
      tableId: row.table_id,
      appId: row.app_id,
      config: safeConfig,
      fieldMapping: row.field_mapping,
      isActive: row.is_active,
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, appId, tableId, config, fieldMapping } = parsed.data;

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  // Encrypt password before storing
  const encryptedPassword = encryptSecret(config.password, tenantSlug);
  const encryptedConfig: EInvoiceConfig = { ...config, password: encryptedPassword };

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.einvoice_configs (tenant_slug, app_id, table_id, config, field_mapping)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_slug, table_id) DO UPDATE SET
       app_id = EXCLUDED.app_id,
       config = EXCLUDED.config,
       field_mapping = EXCLUDED.field_mapping,
       is_active = true
     RETURNING id`,
    [tenantSlug, appId, tableId, JSON.stringify(encryptedConfig), JSON.stringify(fieldMapping)],
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
