/**
 * POST /api/builder/apps/[appId]/rest-connectors/[connectorId]/test
 * Runs a named request with test variables and returns the response.
 * Only available in builder context (requires session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { executeRestRequest } from '@/platform/connectors/rest-connector';
import type { RestConnectorDef } from '@/platform/connectors/rest-connector';

type Params = Promise<{ appId: string; connectorId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId, connectorId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    // Load connector
    const result = await pgPool.query(
      `SELECT rc.* FROM public.rest_connectors rc
       JOIN public.apps a ON a.id = rc.app_id
       WHERE rc.id = $1 AND rc.app_id = $2 AND a.tenant_slug = $3`,
      [connectorId, appId, tenantSlug],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const row = result.rows[0];
    const connector: RestConnectorDef = {
      id: row.id,
      appId: row.app_id,
      name: row.name,
      baseUrl: row.base_url,
      auth: row.auth,
      defaultHeaders: row.default_headers ?? {},
      requests: row.requests ?? [],
    };

    const body = (await req.json()) as { requestId: string; variables?: Record<string, unknown> };
    const { requestId, variables = {} } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 });
    }

    // Stub secret getter — for test mode, secrets come from stored connector refs
    const secretGetter = async (name: string): Promise<string> => {
      const secretResult = await pgPool.query(
        'SELECT value FROM public.platform_secrets WHERE name = $1 AND tenant_slug = $2',
        [name, tenantSlug],
      );
      if (secretResult.rows.length === 0) throw new Error(`Secret not found: ${name}`);
      return secretResult.rows[0].value as string;
    };

    const response = await executeRestRequest(connector, requestId, variables, secretGetter);
    return NextResponse.json({ response });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
