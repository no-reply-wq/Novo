/**
 * GET /api/builder/apps/[appId]
 * Returns a single app by id, scoped to the authenticated user's tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import logger from '@/lib/logger';

type Params = Promise<{ appId: string }>;

interface DbAppRow {
  id: string;
  tenant_slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
) {
  try {
    const { appId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantSlug = session.user.tenantSlug;
    if (!tenantSlug) {
      return NextResponse.json({ error: 'No tenant' }, { status: 403 });
    }

    const result = await pgPool.query<DbAppRow>(
      'SELECT * FROM public.apps WHERE id = $1 AND tenant_slug = $2',
      [appId, tenantSlug],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      id: row.id,
      name: row.name,
      tenantSlug: row.tenant_slug,
      description: row.description ?? undefined,
      icon: row.icon ?? undefined,
      color: row.color ?? undefined,
      publishedAt: row.published_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    logger.error('GET /api/builder/apps/[appId] failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
