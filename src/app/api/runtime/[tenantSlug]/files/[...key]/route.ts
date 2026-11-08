/**
 * GET  /api/runtime/[tenantSlug]/files/[...key]  → redirect to signed URL (1 h)
 * DELETE /api/runtime/[tenantSlug]/files/[...key] → remove file (tenant-scoped auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { requirePermission } from '@/lib/auth/permissions';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { getSignedDownloadUrl, deleteFile } from '@/platform/integrations/storage/storage';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ tenantSlug: string; key: string[] }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug, key: keySegments } = await params;

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  const perm = await requirePermission(ctx, MODULE.SALES_ORDERS, 'view');
  if (perm instanceof NextResponse) return perm;

  const key = keySegments.join('/');

  // Enforce tenant isolation: key must start with the tenant slug
  if (!key.startsWith(`${tenantSlug}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const signedUrl = await getSignedDownloadUrl({ tenantSlug, key, expiresIn: 3600 });
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    }
    console.error('[files/get] Error generating signed URL:', err);
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug, key: keySegments } = await params;

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const key = keySegments.join('/');

  // Enforce tenant isolation
  if (!key.startsWith(`${tenantSlug}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await deleteFile(tenantSlug, key);

    // Remove tracking record
    await pgPool.query(
      `DELETE FROM platform.file_uploads WHERE tenant_slug = $1 AND storage_key = $2`,
      [tenantSlug, key]
    );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    }
    console.error('[files/delete] Error deleting file:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
