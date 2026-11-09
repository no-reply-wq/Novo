/**
 * ONE-TIME migration: provision the tenant_colorplas schema with
 * the standard tenant-schema.sql tables (roles, users, permissions, etc.)
 * and create admin@colorplas.com user.
 *
 * DELETE THIS FILE after running.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { pgPool, prisma } from '@/lib/db/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashPassword } from '@/lib/auth/password';

const SCHEMA = 'tenant_colorplas';
const ADMIN_EMAIL = 'admin@colorplas.com';
const ADMIN_NAME = 'Colorplas Admin';
const ADMIN_PASSWORD = 'Colorplas@123';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });
  }

  const client = await pgPool.connect();
  const steps: string[] = [];

  try {
    // Check if roles table already exists
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'roles'`,
      [SCHEMA]
    );

    if (tableCheck.rows.length > 0) {
      // Tables exist — just check/create admin user
      steps.push('Schema tables already exist');
    } else {
      // Run tenant-schema.sql
      const templatePath = join(process.cwd(), 'prisma', 'tenant-schema.sql');
      let sql = readFileSync(templatePath, 'utf-8');
      sql = sql.replace(/":schema"/g, `"${SCHEMA}"`);
      await client.query(sql);
      steps.push('Ran tenant-schema.sql — tables created');
    }

    // Get admin role
    const adminRoleResult = await client.query(
      `SELECT id FROM "${SCHEMA}".roles WHERE name = 'admin' LIMIT 1`
    );
    const adminRoleId = adminRoleResult.rows[0]?.id;
    if (!adminRoleId) {
      return NextResponse.json({ error: 'Admin role not found after schema creation', steps }, { status: 500 });
    }
    steps.push(`Admin role id: ${adminRoleId}`);

    // Check if admin user exists
    const userCheck = await client.query(
      `SELECT id FROM "${SCHEMA}".users WHERE email = $1 LIMIT 1`,
      [ADMIN_EMAIL]
    );

    let adminUserId: string;
    if (userCheck.rows.length > 0) {
      adminUserId = userCheck.rows[0].id;
      steps.push(`Admin user already exists: ${adminUserId}`);
    } else {
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      const userResult = await client.query(
        `INSERT INTO "${SCHEMA}".users (name, email, password_hash, role_id, active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [ADMIN_NAME, ADMIN_EMAIL, passwordHash, adminRoleId]
      );
      adminUserId = userResult.rows[0].id;
      steps.push(`Created admin user: ${adminUserId}`);
    }

    // Ensure admin has all permissions
    const modules = [
      'leads', 'quotations', 'sales', 'purchase',
      'inventory', 'expenses', 'form_builder', 'ui_builder', 'settings',
      'tables', 'workflows', 'nav', 'upload', 'relations', 'rows',
      'fields', 'forms', 'pdf', 'notifications', 'search', 'reports',
      'integrations', 'sales_orders', 'crm'
    ];
    const actions = ['view', 'create', 'edit', 'delete', 'approve', 'manage_users', 'manage_roles'];

    for (const mod of modules) {
      for (const action of actions) {
        await client.query(
          `INSERT INTO "${SCHEMA}".permissions (role_id, module, action, granted)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (role_id, module, action) DO UPDATE SET granted = true`,
          [adminRoleId, mod, action]
        );
      }
    }
    steps.push('Permissions seeded for admin role');

    return NextResponse.json({
      success: true,
      steps,
      credentials: {
        url: 'http://localhost:3000/login',
        companyId: 'colorplas',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, steps }, { status: 500 });
  } finally {
    client.release();
  }
}
