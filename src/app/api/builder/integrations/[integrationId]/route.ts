/**
 * Builder Integrations — single resource
 * GET    /api/builder/integrations/[integrationId]?tenant=slug
 * PATCH  /api/builder/integrations/[integrationId]
 * DELETE /api/builder/integrations/[integrationId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import type { IntegrationConfig, IntegrationType } from '@/platform/integrations/types';
import { encryptSecret } from '@/platform/integrations/secrets';

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

const PatchSchema = z.object({
  tenantSlug: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

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

type Params = { params: Promise<{ integrationId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { integrationId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<DbRow>(
    `SELECT id, tenant_slug, type, name, config, enabled, created_at, updated_at
     FROM platform.integration_configs
     WHERE id = $1 AND tenant_slug = $2`,
    [integrationId, tenantSlug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const integration = rowToConfig(result.rows[0]);
  integration.config = Object.fromEntries(Object.keys(integration.config).map((k) => [k, '****']));

  return NextResponse.json({ integration });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { integrationId } = await params;
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, name, config, enabled } = parsed.data;
  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  // Encrypt updated config values
  let encryptedConfig: Record<string, string> | undefined;
  if (config) {
    encryptedConfig = {};
    for (const [k, v] of Object.entries(config)) {
      encryptedConfig[k] = encryptSecret(v, tenantSlug);
    }
  }

  const setParts: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [integrationId, tenantSlug];

  if (name !== undefined) {
    values.push(name);
    setParts.push(`name = $${values.length}`);
  }
  if (encryptedConfig !== undefined) {
    values.push(JSON.stringify(encryptedConfig));
    setParts.push(`config = $${values.length}::jsonb`);
  }
  if (enabled !== undefined) {
    values.push(enabled);
    setParts.push(`enabled = $${values.length}`);
  }

  const result = await pgPool.query<DbRow>(
    `UPDATE platform.integration_configs
     SET ${setParts.join(', ')}
     WHERE id = $1 AND tenant_slug = $2
     RETURNING id, tenant_slug, type, name, config, enabled, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const integration = rowToConfig(result.rows[0]);
  integration.config = Object.fromEntries(Object.keys(integration.config).map((k) => [k, '****']));

  return NextResponse.json({ integration });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { integrationId } = await params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const authErr = await authorize(tenantSlug);
  if (authErr) return authErr;

  const result = await pgPool.query<{ id: string }>(
    `DELETE FROM platform.integration_configs
     WHERE id = $1 AND tenant_slug = $2
     RETURNING id`,
    [integrationId, tenantSlug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
