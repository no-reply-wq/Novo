import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db/client';
import { migrateAllMasters } from '@/lib/db/migrations/migrate-masters-to-form-builder';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { tenantSlug, confirm } = body;
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
  if (confirm !== true) {
    return NextResponse.json({ error: 'This migrates real Masters data. Pass { "confirm": true } to proceed.' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  try {
    const result = await migrateAllMasters(tenant.schemaName);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
