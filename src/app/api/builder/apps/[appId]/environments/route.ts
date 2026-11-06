import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { listEnvironments, ensureEnvironments } from '@/platform/packaging/versioning';

type RouteContext = { params: Promise<{ appId: string }> };

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const tenantSlug = body.tenant ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const appRes = await pgPool.query<{ slug: string }>(
    `SELECT slug FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if ((appRes.rowCount ?? 0) === 0) return NextResponse.json({ error: 'App not found' }, { status: 404 });
  const appSlug = appRes.rows[0].slug;

  const client = await pgPool.connect();
  try {
    await ensureEnvironments(appId, appSlug, client);
    const environments = await listEnvironments(appId, client);
    return NextResponse.json({ environments }, { status: 201 });
  } finally {
    client.release();
  }
}
