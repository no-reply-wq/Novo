/**
 * src/__tests__/access/policy-applier.test.ts
 *
 * Integration tests for policy-store + policy-applier against real Postgres.
 *
 * Skipped automatically when DATABASE_URL is not set (CI without Postgres).
 *
 * To run locally:
 *   DATABASE_URL=postgres://... npx jest src/__tests__/access/policy-applier.test.ts
 */

import { Pool, PoolClient } from 'pg';
import { savePolicies } from '@/platform/access/policy-store';
import { applyPoliciesForTable } from '@/platform/access/policy-applier';
import { enforceAccess } from '@/platform/access/runtime-check';

const DB_URL = process.env.DATABASE_URL ?? process.env.PLATFORM_DATABASE_URL ?? '';

const describeIfDb = DB_URL ? describe : describe.skip;

describeIfDb('policy-applier (integration)', () => {
  let pool: Pool;
  let client: PoolClient;
  const tenantSlug = `test_${Date.now()}`;
  const schemaName = `tenant_${tenantSlug}`;
  const tableApiKey = 'orders';
  const appId = `app_${Date.now()}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    client = await pool.connect();

    // Create platform schema + tables if not present
    await client.query(`CREATE SCHEMA IF NOT EXISTS platform`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.access_policies (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        app_id        TEXT NOT NULL,
        table_api_key TEXT NOT NULL,
        role_id       TEXT NOT NULL,
        operation     TEXT NOT NULL,
        expr          TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create a test tenant schema + table
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${JSON.stringify(schemaName).replace(/"/g, '')}`);
    // Note: schemaName contains only [a-z0-9_] from its construction so safe to use directly
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableApiKey}" (
        id        SERIAL PRIMARY KEY,
        owner_id  TEXT NOT NULL,
        payload   TEXT
      )
    `);

    // Ensure tenant_app_role exists (policy-applier creates it, but let's not depend on order)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_app_role') THEN
          CREATE ROLE tenant_app_role NOLOGIN;
        END IF;
      END $$;
    `);

    // Grant usage on schema and table to tenant_app_role
    await client.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO tenant_app_role`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${schemaName}"."${tableApiKey}" TO tenant_app_role`,
    );

    // Insert test rows with different owner_ids
    await client.query(
      `INSERT INTO "${schemaName}"."${tableApiKey}" (owner_id, payload) VALUES ('user-a', 'row1'), ('user-b', 'row2'), ('user-a', 'row3')`,
    );
  });

  afterAll(async () => {
    // Clean up
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.query(
      `DELETE FROM platform.access_policies WHERE app_id = $1`,
      [appId],
    );
    client.release();
    await pool.end();
  });

  it('saves policies and applies RLS so user-a sees only their rows', async () => {
    // Save a policy: user can only see rows where owner_id matches their user_id GUC
    await savePolicies(client, appId, tableApiKey, [
      {
        roleId: '__all__',
        operation: 'select',
        expr: `owner_id = current_setting('app.user_id', true)`,
      },
    ]);

    const result = await applyPoliciesForTable(client, appId, tenantSlug, tableApiKey);
    expect(result.errors).toHaveLength(0);
    expect(result.applied).toBeGreaterThanOrEqual(1);

    // Query as user-a — should see 2 rows
    await client.query('BEGIN');
    await enforceAccess(client, tenantSlug, 'user-a', ['viewer'], []);
    const { rows: rowsA } = await client.query(
      `SET LOCAL ROLE tenant_app_role; SELECT * FROM "${schemaName}"."${tableApiKey}"`,
    );
    await client.query('COMMIT');

    const aRows = rowsA.filter((r: { owner_id: string }) => r.owner_id !== undefined);
    expect(aRows.every((r: { owner_id: string }) => r.owner_id === 'user-a')).toBe(true);
    expect(aRows).toHaveLength(2);
  });

  it('user-b sees only their rows', async () => {
    await client.query('BEGIN');
    await enforceAccess(client, tenantSlug, 'user-b', ['viewer'], []);
    const { rows } = await client.query(
      `SET LOCAL ROLE tenant_app_role; SELECT * FROM "${schemaName}"."${tableApiKey}"`,
    );
    await client.query('COMMIT');

    expect(rows.every((r: { owner_id: string }) => r.owner_id === 'user-b')).toBe(true);
    expect(rows).toHaveLength(1);
  });
});
