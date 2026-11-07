/**
 * PUT /api/builder/apps/[appId]/environments/[name]?tenant=...
 * Updates environment-specific settings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { updateEnvironmentSettings } from '@/platform/lifecycle/version-service';

const BodySchema = z.object({ settings: z.record(z.string(), z.unknown()) });
type RouteContext = { params: Promise<{ appId: string; name: string }> };

export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId, name } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const validEnvs = ['development', 'staging', 'production'] as const;
  if (!validEnvs.includes(name as (typeof validEnvs)[number])) return NextResponse.json({ error: 'Invalid environment: ' + name }, { status: 400 });
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });
  const appRes = await pgPool.query<{ id: string }>(`SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2`, [appId, tenantSlug]);
  if ((appRes.rowCount ?? 0) === 0) return NextResponse.json({ error: 'App not found' }, { status: 404 });
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const client = await pgPool.connect();
  try {
    const env = await updateEnvironmentSettings(appId, name as 'development' | 'staging' | 'production', parsed.data.settings, client);
    return NextResponse.json({ environment: env });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 422 });
  } finally { client.release(); }
}
