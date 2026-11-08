import { pgPool } from './client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashPassword } from '../auth/password';

export interface ProvisionTenantInput {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

export interface ProvisionTenantResult {
  adminUserId: string;
  starterAppId: string;
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const { tenantSlug, schemaName, adminEmail, adminName, adminPassword } = input;

  if (!/^[a-z][a-z0-9_]{2,62}$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const client = await pgPool.connect();
  try {
    // 1. Create schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // 2. Grant lrbc_user full access — skip gracefully if role doesn't exist (local dev)
    const roleCheck = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'lrbc_user'`
    );
    if (roleCheck.rows.length > 0) {
      await client.query(`GRANT ALL ON SCHEMA "${schemaName}" TO lrbc_user`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO lrbc_user`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON SEQUENCES TO lrbc_user`);
    }

    // 3. Read template and replace placeholder
    const templatePath = join(process.cwd(), 'prisma', 'tenant-schema.sql');
    let sql = readFileSync(templatePath, 'utf-8');
    sql = sql.replace(/":schema"/g, `"${schemaName}"`);

    // 4. Execute entire SQL block at once
    await client.query(sql);

    // 5. Get the seeded admin role
    const adminRoleResult = await client.query(
      `SELECT id FROM "${schemaName}".roles WHERE name = 'admin' LIMIT 1`
    );
    const adminRoleId = adminRoleResult.rows[0]?.id;

    if (!adminRoleId) {
      throw new Error('Admin role not found after schema creation');
    }

    // 6. Create admin user
    const passwordHash = await hashPassword(adminPassword);
    const userResult = await client.query(
      `INSERT INTO "${schemaName}".users (name, email, password_hash, role_id, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [adminName, adminEmail, passwordHash, adminRoleId]
    );
    const adminUserId = userResult.rows[0].id as string;

    // 7. Grant all permissions to admin role
    const modules = [
      'leads', 'quotations', 'sales', 'purchase',
      'inventory', 'expenses', 'form_builder', 'ui_builder', 'settings'
    ];
    const actions = ['view', 'create', 'edit', 'delete', 'approve', 'manage_users', 'manage_roles'];

    for (const mod of modules) {
      for (const action of actions) {
        await client.query(
          `INSERT INTO "${schemaName}".permissions (role_id, module, action, granted)
           VALUES ($1, $2, $3, true)
           `,
          [adminRoleId, mod, action]
        );
      }
    }

    // 8. Create default "My App" starter app
    // Try public.apps first, fall back to platform.apps (schema differences between envs)
    let starterAppId: string;
    const appsTableCheck = await client.query(
      `SELECT table_schema FROM information_schema.tables
       WHERE table_name = 'apps'
       AND table_schema IN ('public', 'platform')
       ORDER BY table_schema = 'public' DESC
       LIMIT 1`
    );
    const appsSchema = appsTableCheck.rows[0]?.table_schema ?? 'public';

    const appResult = await client.query<{ id: string }>(
      `INSERT INTO "${appsSchema}".apps (tenant_slug, name, description, icon, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantSlug, 'My App', 'Default starter application', 'layout-dashboard', '#6366f1']
    );
    starterAppId = appResult.rows[0].id;

    // 9. Seed default member role (read-only permissions)
    const memberRoleResult = await client.query<{ id: string }>(
      `SELECT id FROM "${schemaName}".roles WHERE name = 'member' LIMIT 1`
    );
    const memberRoleId = memberRoleResult.rows[0]?.id;
    if (memberRoleId) {
      const viewOnlyModules = ['leads', 'quotations', 'sales', 'inventory'];
      for (const mod of viewOnlyModules) {
        await client.query(
          `INSERT INTO "${schemaName}".permissions (role_id, module, action, granted)
           VALUES ($1, $2, 'view', true)
           `,
          [memberRoleId, mod]
        );
      }
    }

    return { adminUserId, starterAppId };
  } catch (err) {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch { }
    throw err;
  } finally {
    client.release();
  }
}

export function tenantSlugToSchemaName(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `tenant_${safe}`;
}

export async function deprovisionTenant(schemaName: string): Promise<void> {
  if (!schemaName.startsWith('tenant_')) {
    throw new Error('Refusing to drop a schema that does not start with "tenant_"');
  }
  const client = await pgPool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    client.release();
  }
}

export async function getTenantUserCount(schemaName: string): Promise<number> {
  const client = await pgPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM "${schemaName}".users WHERE active = true`
    );
    return parseInt(result.rows[0].count as string, 10);
  } finally {
    client.release();
  }
}
