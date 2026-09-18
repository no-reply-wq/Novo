import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuid } from 'uuid';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const [roles, permissions] = await Promise.all([
    tenantQuery(ctx.schemaName, 'SELECT * FROM roles ORDER BY name'),
    tenantQuery(ctx.schemaName,
      'SELECT * FROM permissions WHERE role_id IS NOT NULL ORDER BY module, action'),
  ]);

  // Group permissions by role_id
  const permsByRole = permissions.rows.reduce((acc: Record<string, unknown[]>, p: Record<string, unknown>) => {
    const key = p.role_id as string;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return NextResponse.json({ roles: roles.rows, permsByRole });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_roles');
  if (ctx instanceof NextResponse) return ctx;

  const { name, description, permissions } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: 'Role name required' }, { status: 400 });

  const id = uuid();
  await tenantQuery(ctx.schemaName,
    `INSERT INTO roles (id, name, description) VALUES ($1,$2,$3)`, [id, name, description ?? null]);

  // Bulk insert permissions
  if (Array.isArray(permissions) && permissions.length > 0) {
    for (const p of permissions) {
      await tenantQuery(ctx.schemaName,
        `INSERT INTO permissions (id, role_id, module, action, granted) VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (role_id, module, action) DO UPDATE SET granted = true`,
        [uuid(), id, p.module, p.action]);
    }
  }

  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const roleId = searchParams.get('roleId');
  if (!tenantSlug || !roleId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_roles');
  if (ctx instanceof NextResponse) return ctx;

  const { permissions } = await req.json().catch(() => ({}));
  if (!Array.isArray(permissions)) return NextResponse.json({ error: 'permissions array required' }, { status: 400 });

  // Replace all permissions for this role
  await tenantQuery(ctx.schemaName, 'DELETE FROM permissions WHERE role_id = $1', [roleId]);
  for (const p of permissions) {
    await tenantQuery(ctx.schemaName,
      `INSERT INTO permissions (id, role_id, module, action, granted) VALUES ($1,$2,$3,$4,$5)`,
      [uuid(), roleId, p.module, p.action, p.granted !== false]);
  }

  return NextResponse.json({ success: true });
}
