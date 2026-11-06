import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { promoteToPreview } from '@/platform/packaging/versioning';

type RouteContext = { params: Promise<{ appId: string; versionId: string }> };

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId, versionId } = await context.params;
  const body = await req.json().catch(() => ({})) as { tenant?: string };
  const tenantSlug = body.tenant ?? req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const client = await pgPool.connect();
  try {
    const version = await promoteToPreview(versionId, appId, client);
    return NextResponse.json(version);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
