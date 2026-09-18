import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  roleId: z.string(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  roleId: z.string().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const users = await tenantQuery(ctx.schemaName,
    `SELECT u.id, u.name, u.email, u.active, u.created_at, u.last_login,
            r.id as role_id, r.name as role_name
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
     ORDER BY u.name`
  );

  return NextResponse.json({ users: users.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  // Enforce seat limit
  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
  if (tenant) {
    const activeCount = await tenantQuery<{ count: string }>(ctx.schemaName,
      'SELECT COUNT(*) as count FROM users WHERE active = true');
    const current = parseInt(activeCount.rows[0]?.count ?? '0', 10);
    if (current >= tenant.seatLimit) {
      return NextResponse.json({
        error: `Seat limit reached (${tenant.seatLimit} seats). Contact LRBC to upgrade your plan.`
      }, { status: 402 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  // Check email uniqueness
  const existing = await tenantQuery<{ id: string }>(ctx.schemaName,
    'SELECT id FROM users WHERE email = $1', [d.email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const id = uuid();
  const passwordHash = await hashPassword(d.password);

  await tenantQuery(ctx.schemaName,
    `INSERT INTO users (id, name, email, password_hash, role_id) VALUES ($1,$2,$3,$4,$5)`,
    [id, d.name, d.email, passwordHash, d.roleId]
  );

  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const userId = searchParams.get('id');
  if (!tenantSlug || !userId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;
  const updates: string[] = [];
  const params: unknown[] = [];

  if (d.name !== undefined) { params.push(d.name); updates.push(`name = $${params.length}`); }
  if (d.email !== undefined) { params.push(d.email); updates.push(`email = $${params.length}`); }
  if (d.roleId !== undefined) { params.push(d.roleId); updates.push(`role_id = $${params.length}`); }
  if (d.active !== undefined) { params.push(d.active); updates.push(`active = $${params.length}`); }
  if (d.password !== undefined) {
    params.push(await hashPassword(d.password));
    updates.push(`password_hash = $${params.length}`);
  }

  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  params.push(userId);
  await tenantQuery(ctx.schemaName,
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);

  return NextResponse.json({ success: true });
}
