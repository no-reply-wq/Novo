import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

async function ensureRoles(schema: string) {
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _roles (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', color TEXT DEFAULT '#6366f1', is_admin BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _permissions (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, role_id TEXT NOT NULL REFERENCES _roles(id) ON DELETE CASCADE, resource TEXT NOT NULL, can_view BOOLEAN DEFAULT true, can_create BOOLEAN DEFAULT false, can_edit BOOLEAN DEFAULT false, can_delete BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(role_id, resource))`);
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _user_roles (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, user_email TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES _roles(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_email, role_id))`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureRoles(ctx.schemaName);

  const roles = await tenantQuery(ctx.schemaName, `SELECT * FROM _roles WHERE is_active=true ORDER BY is_admin DESC, name ASC`);
  const permissions = await tenantQuery(ctx.schemaName, `SELECT * FROM _permissions`);
  const userRoles = await tenantQuery(ctx.schemaName, `SELECT * FROM _user_roles`);

  return NextResponse.json({ roles: roles.rows, permissions: permissions.rows, userRoles: userRoles.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureRoles(ctx.schemaName);

  const body = await req.json();
  const { action } = body;

  if (action === 'save_role') {
    const { id, name, description = '', color = '#6366f1', is_admin = false } = body;
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (id) {
      const r = await tenantQuery(ctx.schemaName, `UPDATE _roles SET name=$1, description=$2, color=$3, is_admin=$4 WHERE id=$5 RETURNING *`, [name, description, color, is_admin, id]);
      return NextResponse.json({ role: r.rows[0] });
    }
    const r = await tenantQuery(ctx.schemaName, `INSERT INTO _roles (name, description, color, is_admin) VALUES ($1,$2,$3,$4) RETURNING *`, [name, description, color, is_admin]);
    return NextResponse.json({ role: r.rows[0] });
  }

  if (action === 'delete_role') {
    await tenantQuery(ctx.schemaName, `UPDATE _roles SET is_active=false WHERE id=$1`, [body.roleId]);
    return NextResponse.json({ ok: true });
  }

  if (action === 'save_permission') {
    const { role_id, resource, can_view=true, can_create=false, can_edit=false, can_delete=false } = body;
    await tenantQuery(ctx.schemaName,
      `INSERT INTO _permissions (role_id, resource, can_view, can_create, can_edit, can_delete) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (role_id, resource) DO UPDATE SET can_view=$3, can_create=$4, can_edit=$5, can_delete=$6`,
      [role_id, resource, can_view, can_create, can_edit, can_delete]);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_permission') {
    await tenantQuery(ctx.schemaName, `DELETE FROM _permissions WHERE role_id=$1 AND resource=$2`, [body.role_id, body.resource]);
    return NextResponse.json({ ok: true });
  }

  if (action === 'assign_user') {
    const { user_email, role_id } = body;
    await tenantQuery(ctx.schemaName,
      `INSERT INTO _user_roles (user_email, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [user_email.toLowerCase(), role_id]);
    return NextResponse.json({ ok: true });
  }

  if (action === 'remove_user') {
    await tenantQuery(ctx.schemaName, `DELETE FROM _user_roles WHERE user_email=$1 AND role_id=$2`, [body.user_email.toLowerCase(), body.role_id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
