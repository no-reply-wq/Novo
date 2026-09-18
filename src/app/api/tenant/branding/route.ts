import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import { invalidateTenantCache } from '@/lib/tenant/resolver';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { name: true, primaryColor: true, logoUrl: true },
  });

  return NextResponse.json(tenant ?? {});
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  const { primaryColor, name } = await req.json().catch(() => ({}));

  const update: Record<string, string> = {};
  if (primaryColor) update.primaryColor = primaryColor;
  if (name) update.name = name;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.tenant.update({ where: { slug: tenantSlug }, data: update });
  invalidateTenantCache(tenantSlug);

  return NextResponse.json({ success: true });
}
