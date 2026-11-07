/**
 * POST /api/builder/apps/[appId]/versions/[versionId]/publish-to
 * Lifecycle publish: targets a specific environment (staging | production).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { publishVersion } from '@/platform/lifecycle/version-service';

const BodySchema = z.object({ tenant: z.string().min(1), environment: z.enum(['staging', 'production']) });
type RouteContext = { params: Promise<{ appId: string; versionId: string }> };

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId, versionId } = await context.params;
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { tenant: tenantSlug, environment } = parsed.data;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean; id?: string };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });
  const appRes = await pgPool.query<{ id: string }>(`SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2`, [appId, tenantSlug]);
  if ((appRes.rowCount ?? 0) === 0) return NextResponse.json({ error: 'App not found' }, { status: 404 });
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await publishVersion(versionId, environment, user.id ?? 'system', client);
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, versionId, environment });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Publish failed' }, { status: 422 });
  } finally { client.release(); }
}
