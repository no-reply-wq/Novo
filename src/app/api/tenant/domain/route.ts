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
    select: { slug: true, customDomain: true, domainVerified: true },
  });

  return NextResponse.json(tenant ?? { slug: tenantSlug, customDomain: null, domainVerified: false });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  const { domain } = await req.json().catch(() => ({}));
  if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });

  // Basic domain format validation
  const domainRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9](\.[a-z]{2,})+$/;
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 422 });
  }

  // Check if domain is taken by another tenant
  const existing = await prisma.tenant.findFirst({
    where: { customDomain: domain, slug: { not: tenantSlug } },
  });
  if (existing) {
    return NextResponse.json({ error: 'This domain is already in use' }, { status: 409 });
  }

  await prisma.tenant.update({
    where: { slug: tenantSlug },
    data: { customDomain: domain, domainVerified: false },
  });

  invalidateTenantCache(tenantSlug);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  await prisma.tenant.update({
    where: { slug: tenantSlug },
    data: { customDomain: null, domainVerified: false },
  });

  invalidateTenantCache(tenantSlug);

  return NextResponse.json({ success: true });
}
