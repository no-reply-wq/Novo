/**
 * GET  /api/builder/apps/[appId]/rest-connectors   — list connectors
 * POST /api/builder/apps/[appId]/rest-connectors   — create connector
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import type { RestConnectorDef } from '@/platform/connectors/rest-connector';

type Params = Promise<{ appId: string }>;

async function assertAppOwner(appId: string, tenantSlug: string): Promise<boolean> {
  const result = await pgPool.query(
    'SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2',
    [appId, tenantSlug],
  );
  return result.rows.length > 0;
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    if (!(await assertAppOwner(appId, tenantSlug))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await pgPool.query(
      'SELECT * FROM public.rest_connectors WHERE app_id = $1 ORDER BY created_at',
      [appId],
    );

    const connectors = result.rows.map((row) => ({
      id: row.id,
      appId: row.app_id,
      name: row.name,
      baseUrl: row.base_url,
      auth: row.auth,
      defaultHeaders: row.default_headers,
      requests: row.requests,
    }));

    return NextResponse.json({ connectors });
  } catch (err) {
    console.error('[rest-connectors GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    if (!(await assertAppOwner(appId, tenantSlug))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await req.json()) as Partial<RestConnectorDef>;
    const { name, baseUrl, auth, defaultHeaders, requests } = body;

    if (!name || !baseUrl || !auth) {
      return NextResponse.json({ error: 'name, baseUrl, auth required' }, { status: 400 });
    }

    const result = await pgPool.query(
      `INSERT INTO public.rest_connectors
         (app_id, name, base_url, auth, default_headers, requests)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        appId,
        name,
        baseUrl,
        JSON.stringify(auth),
        JSON.stringify(defaultHeaders ?? {}),
        JSON.stringify(requests ?? []),
      ],
    );

    const row = result.rows[0];
    return NextResponse.json(
      {
        connector: {
          id: row.id,
          appId: row.app_id,
          name: row.name,
          baseUrl: row.base_url,
          auth: row.auth,
          defaultHeaders: row.default_headers,
          requests: row.requests,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[rest-connectors POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
