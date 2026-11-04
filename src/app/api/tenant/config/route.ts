import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { prisma } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.SETTINGS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { allowedFeatures: true, hiddenModules: true, plan: true, name: true, primaryColor: true, logoUrl: true },
  });

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  return NextResponse.json({
    allowedFeatures: (tenant.allowedFeatures as string[]) ?? [],
    hiddenModules: (tenant.hiddenModules as string[]) ?? [],
    plan: tenant.plan,
    name: tenant.name,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
  });
}
