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
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const result = await pgPool.query<ConnectorRow>(
    `SELECT id, app_id, name, base_url, config
     FROM platform.rest_connectors
     WHERE app_id = $1
     ORDER BY name`,
    [appId],
  );
  return NextResponse.json({ connectors: result.rows.map(rowToConnector) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const body = (await req.json()) as Partial<RESTConnector>;

  if (!body.name || !body.baseUrl) {
    return NextResponse.json({ error: 'name and baseUrl are required' }, { status: 400 });
  }

  const config = {
    authType: body.authType ?? 'none',
    authConfig: body.authConfig ?? { type: 'none' },
    defaultHeaders: body.defaultHeaders ?? {},
    requests: body.requests ?? [],
  };

  const result = await pgPool.query<ConnectorRow>(
    `INSERT INTO platform.rest_connectors (app_id, name, base_url, config)
     VALUES ($1, $2, $3, $4)
     RETURNING id, app_id, name, base_url, config`,
    [appId, body.name, body.baseUrl, JSON.stringify(config)],
  );

  return NextResponse.json({ connector: rowToConnector(result.rows[0]!) }, { status: 201 });
}
