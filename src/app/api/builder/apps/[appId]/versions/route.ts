/**
 * App Versions API
 * GET  /api/builder/apps/[appId]/versions             — list versions
 * POST /api/builder/apps/[appId]/versions             — create new version
 * POST /api/builder/apps/[appId]/versions/[versionId]/rollback — roll back
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import {
  createAppVersion,
  listAppVersions,
} from '@/platform/packages/versioning';

async function authorizeAppAccess(
  tenantSlug: string,
  appId: string,
): Promise<NextResponse | true> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const appRes = await pgPool.query<{ id: string }>(
    `SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if (appRes.rowCount === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  return true;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const auth = await authorizeAppAccess(tenantSlug, appId);
  if (auth instanceof NextResponse) return auth;

  const client = await pgPool.connect();
  try {
    const versions = await listAppVersions(tenantSlug, appId, client);
    return NextResponse.json({ versions });
  } finally {
    client.release();
  }
}

const CreateVersionSchema = z.object({
  tenant: z.string().min(1),
  label: z.string().min(1).max(100),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await context.params;

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = CreateVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenant: tenantSlug, label } = parsed.data;

  const auth = await authorizeAppAccess(tenantSlug, appId);
  if (auth instanceof NextResponse) return auth;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id;

  const client = await pgPool.connect();
  try {
    const versionId = await createAppVersion(tenantSlug, appId, label, client, userId);
    return NextResponse.json({ versionId }, { status: 201 });
  } finally {
    client.release();
  }
}
