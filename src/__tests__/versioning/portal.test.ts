/**
 * Tests for customer portal service.
 */

import { generatePortalToken, validatePortalToken, getPortalRecords } from '@/platform/portal/service';
import { Pool } from 'pg';

const TEST_DB = process.env['TEST_DATABASE_URL'];

describe('portal tokens (unit)', () => {
  it('generate and validate a fresh token', async () => {
    const pool = {} as Pool; // not used in generate/validate
    const pt = await generatePortalToken('customer@acme.com', 'app-1', 'acme', pool);
    expect(pt.token).toBeTruthy();
    expect(pt.email).toBe('customer@acme.com');
    expect(pt.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const validated = await validatePortalToken(pt.token);
    expect(validated).not.toBeNull();
    expect(validated!.email).toBe('customer@acme.com');
    expect(validated!.appId).toBe('app-1');
  });

  it('invalid token returns null', async () => {
    const result = await validatePortalToken('invalid.token');
    expect(result).toBeNull();
  });

  it('tampered token returns null', async () => {
    const pool = {} as Pool;
    const pt = await generatePortalToken('x@x.com', 'app-2', 'slug', pool);
    const tampered = pt.token.slice(0, -5) + 'XXXXX';
    expect(await validatePortalToken(tampered)).toBeNull();
  });
});

(TEST_DB ? describe : describe.skip)('getPortalRecords (integration)', () => {
  let pool: Pool;
  const appId = 'portal-app';
  const tenantSlug = 'test_portal_tenant';

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS platform`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform.portal_configs (
        app_id TEXT PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled BOOLEAN DEFAULT false
      )
    `);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${tenantSlug}`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tenantSlug}.orders (id TEXT PRIMARY KEY, customer_email TEXT, total NUMERIC)`);
    await pool.query(`TRUNCATE ${tenantSlug}.orders`);
    await pool.query(`INSERT INTO ${tenantSlug}.orders VALUES ('o1','alice@acme.com',500),('o2','bob@acme.com',200)`);

    await pool.query(`
      INSERT INTO platform.portal_configs (app_id, config, enabled)
      VALUES ($1, $2::jsonb, true)
      ON CONFLICT (app_id) DO UPDATE SET config = $2::jsonb, enabled = true
    `, [appId, JSON.stringify({
      enabled: true,
      allowedTables: ['orders'],
      filterField: 'customer_email',
      allowedFields: { orders: ['id', 'customer_email', 'total'] },
    })]);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${tenantSlug} CASCADE`);
    await pool.query(`DELETE FROM platform.portal_configs WHERE app_id = $1`, [appId]);
    await pool.end();
  });

  it('returns only the customer\'s own records', async () => {
    const pt = await generatePortalToken('alice@acme.com', appId, tenantSlug, pool);
    const validated = await validatePortalToken(pt.token);
    const records = await getPortalRecords(validated!, 'orders', pool);
    expect(records.length).toBe(1);
    expect(records[0]['customer_email']).toBe('alice@acme.com');
  });

  it('another customer sees only their records', async () => {
    const pt = await generatePortalToken('bob@acme.com', appId, tenantSlug, pool);
    const validated = await validatePortalToken(pt.token);
    const records = await getPortalRecords(validated!, 'orders', pool);
    expect(records.length).toBe(1);
    expect(records[0]['customer_email']).toBe('bob@acme.com');
  });
});
