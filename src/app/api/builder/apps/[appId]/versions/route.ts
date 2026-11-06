/**
 * GET  /api/builder/apps/[appId]/versions  — list all versions
 * POST /api/builder/apps/[appId]/versions  — create a new draft version
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { createVersion, listVersions } from '@/platform/packaging/versioning';

type RouteContext = { params: Promise<{ appId: string }> };

async function authorizeApp(
  tenantSlug: string,
  appId: string,
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const appRes = await pgPool.query<{ id: string }>(
    `SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if ((appRes.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  return null;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const authErr = await authorizeApp(tenantSlug, appId);
  if (authErr) return authErr;

  const client = await pgPool.connect();
  try {
    const versions = await listVersions(appId, client);
    return NextResponse.json({ versions });
  } finally {
    client.release();
  }
}

const CreateVersionSchema = z.object({
  tenant: z.string().min(1),
  versionLabel: z.string().min(1).max(100),
});

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = CreateVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenant: tenantSlug, versionLabel } = parsed.data;

  const authErr = await authorizeApp(tenantSlug, appId);
  if (authErr) return authErr;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id;

  const client = await pgPool.connect();
  try {
    const version = await createVersion(appId, tenantSlug, versionLabel, client, userId);
    return NextResponse.json(version, { status: 201 });
  } finally {
    client.release();
  }
}
