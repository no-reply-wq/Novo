/**
 * GET    /api/platform/tenants/[tenantId] — get tenant with full config
 * PATCH  /api/platform/tenants/[tenantId] — update allowedFeatures, hiddenModules, plan, seatLimit, status
 * DELETE /api/platform/tenants/[tenantId] — permanently delete tenant and drop its DB schema
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { deprovisionTenant } from '@/lib/db/provision-tenant';

type Params = { params: Promise<{ tenantId: string }> };

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true, name: true, slug: true, plan: true, seatLimit: true,
      status: true, primaryColor: true, logoUrl: true, customDomain: true,
      schemaName: true, createdAt: true, hiddenModules: true, allowedFeatures: true,
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ tenant });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tenantId } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed = ['allowedFeatures', 'hiddenModules', 'plan', 'seatLimit', 'status', 'primaryColor', 'logoUrl'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: update,
    select: { id: true, name: true, slug: true, allowedFeatures: true, hiddenModules: true },
  });

  await prisma.platformAuditLog.create({
    data: {
      adminId: session.user.id,
      tenantId,
      action: 'UPDATE_TENANT',
      meta: { fields: Object.keys(update) },
    },
  });

  return NextResponse.json({ tenant });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, schemaName: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Audit log BEFORE deletion — FK to tenant would fail after the row is gone
  await prisma.platformAuditLog.create({
    data: {
      adminId: session.user.id,
      tenantId,
      action: 'DELETE_TENANT',
      meta: { schemaName: tenant.schemaName, slug: tenant.slug },
    },
  });

  // Null out existing audit log FK refs so we can delete the tenant row
  await prisma.$executeRawUnsafe(
    `UPDATE public.platform_audit_logs SET tenant_id = NULL WHERE tenant_id = $1`,
    tenantId,
  );

  // Remove cross-ref rows (FK)
  await prisma.tenantUserRef.deleteMany({ where: { tenantId } });

  // Delete the tenant row
  await prisma.tenant.delete({ where: { id: tenantId } });

  // Remove public.apps rows for this tenant
  await prisma.$executeRawUnsafe(
    `DELETE FROM public.apps WHERE tenant_slug = $1`,
    tenant.slug,
  );

  // Drop the tenant's DB schema last
  if (tenant.schemaName) {
    await deprovisionTenant(tenant.schemaName);
  }

  return NextResponse.json({ deleted: true });
}
