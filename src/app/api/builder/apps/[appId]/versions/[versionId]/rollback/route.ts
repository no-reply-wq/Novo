/**
 * App Version Rollback API
 * POST /api/builder/apps/[appId]/versions/[versionId]/rollback
 * { tenant }
 * → { appId, warnings }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { rollbackToVersion } from '@/platform/packages/versioning';

const RollbackSchema = z.object({
  tenant: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ appId: string; versionId: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = RollbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenant: tenantSlug } = parsed.data;
  const { appId, versionId } = await context.params;

  const sessionTenant = (session.user as { tenantSlug?: string }).tenantSlug ?? '';
  if (!(session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin && sessionTenant !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, status: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const userId = (session.user as { id?: string })?.id;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await rollbackToVersion(tenantSlug, appId, versionId, client, userId);
    await client.query('COMMIT');
    return NextResponse.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Rollback failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
