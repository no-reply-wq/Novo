/**
 * PUT    /api/builder/apps/[appId]/rest-connectors/[connectorId]   — update
 * DELETE /api/builder/apps/[appId]/rest-connectors/[connectorId]   — delete
 * POST   /api/builder/apps/[appId]/rest-connectors/[connectorId]/test — not here (see test/route.ts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import type { RestConnectorDef } from '@/platform/connectors/rest-connector';

type Params = Promise<{ appId: string; connectorId: string }>;

async function assertOwner(appId: string, connectorId: string, tenantSlug: string): Promise<boolean> {
  const res = await pgPool.query(
    `SELECT rc.id FROM public.rest_connectors rc
     JOIN public.apps a ON a.id = rc.app_id
     WHERE rc.id = $1 AND rc.app_id = $2 AND a.tenant_slug = $3`,
    [connectorId, appId, tenantSlug],
  );
  return res.rows.length > 0;
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId, connectorId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    if (!(await assertOwner(appId, connectorId, tenantSlug))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await req.json()) as Partial<RestConnectorDef>;
    const { name, baseUrl, auth, defaultHeaders, requests } = body;

    const result = await pgPool.query(
      `UPDATE public.rest_connectors
       SET name = COALESCE($1, name),
           base_url = COALESCE($2, base_url),
           auth = COALESCE($3::jsonb, auth),
           default_headers = COALESCE($4::jsonb, default_headers),
           requests = COALESCE($5::jsonb, requests),
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [
        name ?? null,
        baseUrl ?? null,
        auth ? JSON.stringify(auth) : null,
        defaultHeaders ? JSON.stringify(defaultHeaders) : null,
        requests ? JSON.stringify(requests) : null,
        connectorId,
      ],
    );

    const row = result.rows[0];
    return NextResponse.json({
      connector: {
        id: row.id,
        appId: row.app_id,
        name: row.name,
        baseUrl: row.base_url,
        auth: row.auth,
        defaultHeaders: row.default_headers,
        requests: row.requests,
      },
    });
  } catch (err) {
    console.error('[rest-connectors PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { appId, connectorId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    if (!(await assertOwner(appId, connectorId, tenantSlug))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await pgPool.query('DELETE FROM public.rest_connectors WHERE id = $1', [connectorId]);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[rest-connectors DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
