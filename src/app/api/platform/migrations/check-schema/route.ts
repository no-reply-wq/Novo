import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma, tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const columns = await tenantQuery(
    tenant.schemaName,
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'form_configs' ORDER BY column_name`,
    [tenant.schemaName]
  );

  return NextResponse.json({ tenantSlug, schemaName: tenant.schemaName, formConfigsColumns: columns.rows.map((r) => r.column_name) });
}
