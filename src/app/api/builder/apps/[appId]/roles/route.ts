/**
 * GET /api/builder/apps/[appId]/roles?tenant=<slug>
 * Returns the list of roles defined in the tenant schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

interface RoleRow {
  id: string;
  name: string;
  is_system: boolean;
  created_at: Date;
}

export async function GET(
  req: NextRequest,
  _ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant query param' }, { status: 400 });
  }

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const result = await tenantQuery<RoleRow>(
    tenant.schemaName,
    `SELECT id, name, is_system, created_at FROM roles ORDER BY name ASC`,
  );

  return NextResponse.json({
    roles: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      isSystem: r.is_system,
      createdAt: r.created_at,
    })),
  });
}
