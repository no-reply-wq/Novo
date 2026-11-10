import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { RESTClient } from '@/platform/integrations/rest/client';
import type { RESTConnector } from '@/platform/integrations/rest/types';
import { requireTenantSession } from '@/lib/auth/tenant-session';

interface ConnectorRow {
  id: string;
  app_id: string;
  name: string;
  base_url: string;
  config: Omit<RESTConnector, 'id' | 'appId' | 'name' | 'baseUrl'>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; connectorId: string; requestId: string }> },
): Promise<NextResponse> {
  const { tenantSlug, connectorId, requestId } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const result = await pgPool.query<ConnectorRow>(
    `SELECT rc.id, rc.app_id, rc.name, rc.base_url, rc.config
     FROM platform.rest_connectors rc
     JOIN platform.apps a ON a.id = rc.app_id
     WHERE rc.id = $1 AND a.tenant_slug = $2`,
    [connectorId, tenantSlug],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }

  const row = result.rows[0]!;
  const connector: RESTConnector = {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    baseUrl: row.base_url,
    authType: row.config.authType ?? 'none',
    authConfig: row.config.authConfig ?? { type: 'none' },
    defaultHeaders: row.config.defaultHeaders ?? {},
    requests: row.config.requests ?? [],
  };

  let params_: Record<string, unknown> = {};
  try {
    params_ = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty params
  }

  const secretsGetter = async (key: string): Promise<string> => {
    const envVal = process.env[key];
    if (envVal) return envVal;
    const secretResult = await pgPool.query<{ value: string }>(
      `SELECT value FROM platform.secrets WHERE key = $1 AND tenant_slug = $2`,
      [key, tenantSlug],
    );
    if (secretResult.rows.length > 0) return secretResult.rows[0]!.value;
    throw new Error(`Secret "${key}" not found`);
  };

  const client = new RESTClient(connector, secretsGetter);

  try {
    const executeResult = await client.execute(requestId, params_);
    return NextResponse.json(executeResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('SSRF blocked')) return NextResponse.json({ error: message }, { status: 403 });
    if (message.includes('not found')) return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
