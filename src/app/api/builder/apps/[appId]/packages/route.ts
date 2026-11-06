/**
 * App Packages API
 * GET  /api/builder/apps/[appId]/packages  — export app as JSON package
 * POST /api/builder/apps/[appId]/packages  — import an app package
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { exportApp } from '@/platform/packages/exporter';
import { importApp } from '@/platform/packages/importer';
import type { AppPackage } from '@/platform/packages/types';

async function authorizeAppAccess(
  tenantSlug: string,
  appId: string,
): Promise<NextResponse | true> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionTenant = (session.user as { tenantSlug?: string }).tenantSlug ?? '';
  if (!session.user.isPlatformAdmin && sessionTenant !== tenantSlug) {
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

// GET — export
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
    const pkg = await exportApp(tenantSlug, appId, client);
    const filename = `${pkg.app.name.replace(/\s+/g, '_')}_${pkg.version}.json`;
    return new NextResponse(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } finally {
    client.release();
  }
}

const ImportSchema = z.object({
  tenant: z.string().min(1),
  overwrite: z.boolean().default(false),
  newAppName: z.string().min(1).optional(),
  package: z.record(z.string(), z.unknown()),
});

// POST — import
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  void context; // appId not used for import — creates a new app

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenant: tenantSlug, overwrite, newAppName, package: pkg } = parsed.data;

  const sessionTenant = (session.user as { tenantSlug?: string }).tenantSlug ?? '';
  if (!(session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin && sessionTenant !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await importApp(
      tenantSlug,
      (pkg as unknown) as AppPackage,
      { overwrite, newAppName },
      client,
    );
    await client.query('COMMIT');
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
