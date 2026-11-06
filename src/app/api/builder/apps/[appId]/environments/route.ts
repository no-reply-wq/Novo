/**
 * GET  /api/builder/apps/[appId]/environments  — list environments
 * POST /api/builder/apps/[appId]/environments  — ensure environments exist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { ensureEnvironments, listEnvironments } from '@/platform/packaging/versioning';

type RouteContext = { params: Promise<{ appId: string }> };

async function authorizeApp(
  tenantSlug: string,
  appId: string,
): Promise<NextResponse | { slug: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const appRes = await pgPool.query<{ id: string; slug: string }>(
    `SELECT id, COALESCE(slug, id::text) AS slug FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if ((appRes.rowCount ?? 0) === 0) return NextResponse.json({ error: 'App not found' }, { status: 404 });

  return { slug: appRes.rows[0].slug };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const result = await authorizeApp(tenantSlug, appId);
  if (result instanceof NextResponse) return result;

  const client = await pgPool.connect();
  try {
    const environments = await listEnvironments(appId, client);
    return NextResponse.json({ environments });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const body = await req.json().catch(() => ({})) as { tenant?: string };
  const tenantSlug = body.tenant ?? req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const result = await authorizeApp(tenantSlug, appId);
  if (result instanceof NextResponse) return result;

  const appSlug = result.slug;

  const client = await pgPool.connect();
  try {
    const environments = await ensureEnvironments(appId, appSlug, client);
    return NextResponse.json({ environments }, { status: 201 });
  } finally {
    client.release();
  }
}
