/**
 * POST /api/marketplace/templates/[slug]/install
 * Install a marketplace template into a tenant as a new app.
 * Body: { tenantSlug, appName? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { getTemplateBySlug } from '@/platform/marketplace';
import { importApp } from '@/platform/packages/importer';

const InstallSchema = z.object({
  tenantSlug: z.string().min(1),
  appName: z.string().min(1).max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = InstallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, appName } = parsed.data;

  // Verify tenant access
  const userTenantSlug = (session.user as { tenantSlug?: string }).tenantSlug;
  const isPlatformAdmin = (session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin;
  if (!isPlatformAdmin && userTenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = await pgPool.connect();
  try {
    const result = await importApp(
      tenantSlug,
      template.package,
      { overwrite: false, newAppName: appName ?? template.name },
      db
    );

    return NextResponse.json({ appId: result.appId, warnings: result.warnings });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[marketplace/install]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    db.release();
  }
}
