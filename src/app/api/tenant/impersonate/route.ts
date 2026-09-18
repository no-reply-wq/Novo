import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, tenantSlug } = body;
  if (!token || !tenantSlug) return NextResponse.json({ error: 'Missing token or tenantSlug' }, { status: 400 });

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const result = await tenantQuery<{ user_id: string; expires_at: string; used: boolean }>(
    tenant.schemaName,
    `SELECT user_id, expires_at, used FROM impersonate_tokens WHERE token = $1`,
    [token]
  );

  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (row.used) return NextResponse.json({ error: 'Token already used' }, { status: 401 });
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 401 });

  await tenantQuery(tenant.schemaName, `UPDATE impersonate_tokens SET used = true WHERE token = $1`, [token]);

  const userResult = await tenantQuery<{ id: string; name: string; email: string; role_id: string; role_name: string }>(
    tenant.schemaName,
    `SELECT u.id, u.name, u.email, u.role_id, r.name as role_name
     FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [row.user_id]
  );

  const user = userResult.rows[0];
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id, name: user.name, email: user.email,
      roleId: user.role_id, roleName: user.role_name,
      tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schemaName,
      isPlatformAdmin: false, isImpersonating: true,
    }
  });
}
