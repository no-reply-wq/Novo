import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import type { RESTConnector } from '@/platform/integrations/rest/types';

interface ConnectorRow {
  id: string;
  app_id: string;
  name: string;
  base_url: string;
  config: Omit<RESTConnector, 'id' | 'appId' | 'name' | 'baseUrl'>;
}

function rowToConnector(row: ConnectorRow): RESTConnector {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    baseUrl: row.base_url,
    authType: row.config.authType ?? 'none',
    authConfig: row.config.authConfig ?? { type: 'none' },
    defaultHeaders: row.config.defaultHeaders ?? {},
    requests: row.config.requests ?? [],
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  const result = await pgPool.query<ConnectorRow>(
    `SELECT id, app_id, name, base_url, config FROM platform.rest_connectors WHERE id = $1 AND app_id = $2`,
    [id, appId],
  );
  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ connector: rowToConnector(result.rows[0]!) });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  const body = (await req.json()) as Partial<RESTConnector>;

  const configPatch = {
    authType: body.authType,
    authConfig: body.authConfig,
    defaultHeaders: body.defaultHeaders,
    requests: body.requests,
  };

  const result = await pgPool.query<ConnectorRow>(
    `UPDATE platform.rest_connectors
     SET name = COALESCE($3, name),
         base_url = COALESCE($4, base_url),
         config = config || $5::jsonb,
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, app_id, name, base_url, config`,
    [id, appId, body.name ?? null, body.baseUrl ?? null, JSON.stringify(configPatch)],
  );

  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ connector: rowToConnector(result.rows[0]!) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  await pgPool.query(`DELETE FROM platform.rest_connectors WHERE id = $1 AND app_id = $2`, [id, appId]);
  return NextResponse.json({ deleted: true });
}
