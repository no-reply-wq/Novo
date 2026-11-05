/**
 * Builder Integrations API
 * GET  /api/builder/integrations?tenant=slug  — list integration configs for tenant
 * POST /api/builder/integrations              — create a new integration config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import type { IntegrationConfig, IntegrationType } from '@/platform/integrations/types';
import { encryptSecret } from '@/platform/integrations/secrets';

const VALID_TYPES = new Set<IntegrationType>([
  'smtp', 'ses', 'resend', 'whatsapp_meta', 's3', 'r2', 'rest', 'postgres', 'mysql',
]);

const CreateIntegrationSchema = z.object({
  tenantSlug: z.string().min(1),
  type: z.string().refine((v): v is IntegrationType => VALID_TYPES.has(v as IntegrationType), {
    message: 'Invalid integration type',
  }),
  name: z.string().min(1).max(200),
  config: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

interface DbRow {
  id: string;
  tenant_slug: string;
  type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToConfig(row: DbRow): IntegrationConfig {
  return {
    id: row.id,
    tenantSlug: row.tenant_slug,
    type: row.type as IntegrationType,
    name: row.name,
    config: row.config,
    enabled: row.enabled,
  };
}

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

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<DbRow>(
    `SELECT id, tenant_slug, type, name, config, enabled, created_at, updated_at
     FROM platform.integration_configs
     WHERE tenant_slug = $1
     ORDER BY created_at DESC`,
    [tenantSlug]
  );

  // Redact config values in the response (only return hints / keys, not encrypted values)
  const integrations = result.rows.map((row) => {
    const cfg = rowToConfig(row);
    cfg.config = Object.fromEntries(Object.keys(cfg.config).map((k) => [k, '****']));
    return cfg;
  });

  return NextResponse.json({ integrations });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = CreateIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, type, name, config, enabled } = parsed.data;

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  // Encrypt all config values before storing
  const encryptedConfig: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    encryptedConfig[k] = encryptSecret(v, tenantSlug);
  }

  const result = await pgPool.query<DbRow>(
    `INSERT INTO platform.integration_configs (tenant_slug, type, name, config, enabled)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, tenant_slug, type, name, config, enabled, created_at, updated_at`,
    [tenantSlug, type, name, JSON.stringify(encryptedConfig), enabled]
  );

  const integration = rowToConfig(result.rows[0]);
  integration.config = Object.fromEntries(Object.keys(integration.config).map((k) => [k, '****']));

  return NextResponse.json({ integration }, { status: 201 });
}
