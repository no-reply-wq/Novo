/**
 * POST /api/runtime/connector/[appId]/[connectorId]/[requestId]
 * Body: { variables: Record<string, unknown> }
 *
 * Validates that the caller is a member of the app's tenant,
 * then executes the named REST request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { executeRestRequest } from '@/platform/connectors/rest-connector';
import type { RestConnectorDef } from '@/platform/connectors/rest-connector';

type Params = Promise<{ appId: string; connectorId: string; requestId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId, connectorId, requestId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    // Verify user is a member of the app's tenant
    const memberCheck = await pgPool.query(
      `SELECT a.id FROM public.apps a
       WHERE a.id = $1 AND a.tenant_slug = $2`,
      [appId, tenantSlug],
    );
    if (memberCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load connector
    const connResult = await pgPool.query(
      'SELECT * FROM public.rest_connectors WHERE id = $1 AND app_id = $2',
      [connectorId, appId],
    );

    if (connResult.rows.length === 0) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const row = connResult.rows[0];
    const connector: RestConnectorDef = {
      id: row.id,
      appId: row.app_id,
      name: row.name,
      baseUrl: row.base_url,
      auth: row.auth,
      defaultHeaders: row.default_headers ?? {},
      requests: row.requests ?? [],
    };

    const body = (await req.json()) as { variables?: Record<string, unknown> };
    const variables = body.variables ?? {};

    const secretGetter = async (name: string): Promise<string> => {
      const secretResult = await pgPool.query(
        'SELECT value FROM public.platform_secrets WHERE name = $1 AND tenant_slug = $2',
        [name, tenantSlug],
      );
      if (secretResult.rows.length === 0) throw new Error(`Secret not found: ${name}`);
      return secretResult.rows[0].value as string;
    };

    const response = await executeRestRequest(connector, requestId, variables, secretGetter);
    return NextResponse.json({ data: response });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
