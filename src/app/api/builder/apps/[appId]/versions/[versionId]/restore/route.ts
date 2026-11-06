/**
 * POST /api/builder/apps/[appId]/versions/[versionId]/restore
 *
 * Restores an app to a previous version snapshot. Creates a new published
 * version whose bundle matches the target version, archiving the current live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { rollbackVersion } from '@/platform/packaging/versioning';

type RouteContext = { params: Promise<{ appId: string; versionId: string }> };

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId, versionId } = await context.params;
  const body = await req.json().catch(() => ({})) as { tenant?: string };
  const tenantSlug = body.tenant ?? req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean; id?: string };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const restored = await rollbackVersion(appId, versionId, client, user.id);
    await client.query('COMMIT');
    return NextResponse.json(restored, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Restore failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
