/**
 * Provision Colorplas tenant in Novo Builder (local dev)
 * Run: node provision-colorplas.mjs
 */
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

const DB_URL = 'postgresql://aniketpattanayak@localhost:5432/novo';
const pool = new Pool({ connectionString: DB_URL });

const TENANT_SLUG = 'colorplas';
const SCHEMA_NAME = 'tenant_colorplas';
const TENANT_NAME = 'Colorplas LLP';
const ADMIN_EMAIL = 'admin@colorplas.com';
const ADMIN_NAME = 'Colorplas Admin';
const ADMIN_PASSWORD = 'Colorplas@123';
const TENANT_ID = 'ten_' + randomUUID().replace(/-/g,'').slice(0,16);

async function run() {
  const client = await pool.connect();
  try {
    console.log('Provisioning Colorplas tenant...\n');

    // 1. Check if tenant already exists
    const existing = await client.query(
      `SELECT id, slug FROM public.tenants WHERE slug = $1`, [TENANT_SLUG]
    );
    if (existing.rows.length > 0) {
      console.log(`Tenant "${TENANT_SLUG}" already exists (id: ${existing.rows[0].id})`);
      console.log('Skipping. Drop schema "tenant_colorplas" first to re-provision.');
      return;
    }

    // 2. Create tenant record
    console.log('Creating tenant record...');
    await client.query(`
      INSERT INTO public.tenants (id, name, slug, plan, seat_limit, status, db_backend, created_at, updated_at)
      VALUES ($1, $2, $3, 'pro', 50, 'ACTIVE', 'POSTGRES', NOW(), NOW())
    `, [TENANT_ID, TENANT_NAME, TENANT_SLUG]);
    console.log(`  OK: ${TENANT_NAME} (${TENANT_SLUG})`);

    // 3. Create schema
    console.log('Creating tenant schema...');
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_NAME}"`);

    // 4. Run template SQL
    console.log('Running schema template...');
    const cwd = process.cwd();
    let sql = readFileSync(`${cwd}/prisma/tenant-schema.sql`, 'utf-8');
    sql = sql.replace(/":schema"/g, `"${SCHEMA_NAME}"`);
    await client.query(sql);
    console.log('  OK: schema tables created');

    // 5. Get admin role
    const roleRes = await client.query(
      `SELECT id FROM "${SCHEMA_NAME}".roles WHERE name = 'admin' LIMIT 1`
    );
    const adminRoleId = roleRes.rows[0]?.id;
    if (!adminRoleId) throw new Error('Admin role not found');

    // 6. Create admin user
    console.log('Creating admin user...');
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const userId = 'usr_' + randomUUID().replace(/-/g,'').slice(0,16);
    await client.query(`
      INSERT INTO "${SCHEMA_NAME}".users (id, name, email, password_hash, role_id, active, token_version, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,true,0,NOW(),NOW())
    `, [userId, ADMIN_NAME, ADMIN_EMAIL, hash, adminRoleId]);
    console.log(`  OK: ${ADMIN_EMAIL}`);

    // 7. Create app record
    console.log('Creating Colorplas ERP app...');
    const appId = 'app_' + randomUUID().replace(/-/g,'').slice(0,16);
    await client.query(`
      INSERT INTO public.apps (id, tenant_slug, name, description, icon, color, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
    `, [appId, TENANT_SLUG, 'Colorplas ERP',
        'Factory-Pilot ERP — LMS, IMS, PMS, Purchase, Dispatch, Vehicle Log, Expenses',
        'factory', '#009A8A']);
    console.log(`  OK: app id = ${appId}`);

    console.log('\n=== DONE ===');
    console.log('Login URL: http://localhost:3000/login');
    console.log('Company:   ' + TENANT_SLUG);
    console.log('Email:     ' + ADMIN_EMAIL);
    console.log('Password:  ' + ADMIN_PASSWORD);
    console.log('Builder:   http://localhost:3000/builder');
    console.log('============\n');

  } catch(e) {
    console.error('ERROR:', e.message, e.detail || '');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => process.exit(1));
