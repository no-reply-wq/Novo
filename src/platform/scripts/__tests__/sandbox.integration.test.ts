/**
 * Integration tests — real Postgres required.
 * Skipped automatically if TEST_DATABASE_URL is not set.
 */

import { Pool } from 'pg';
import { runScript, ScriptDef } from '../sandbox';
import { ScriptRunContext } from '../sandbox';
import { buildSdk } from '../sdk';
import { tenantSchemaName } from '../../data/client';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('sandbox integration (real Postgres)', () => {
  let pool: Pool;
  const tenantSlug = 'integration_test_tenant';
  const schema = tenantSchemaName(tenantSlug);

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    // Create a test schema and table
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.test_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        value INT
      )
    `);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  function makeCtx(): ScriptRunContext {
    return {
      tenantSlug,
      userId: 'integration-user',
      input: { name: 'hello', value: 42 },
      scriptId: 'integration-test',
    };
  }

  function makeScriptDef(code: string): ScriptDef {
    return {
      id: 'integration-script',
      appId: 'test-app',
      name: 'Integration Test Script',
      language: 'javascript',
      code,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('script inserts a record via sdk.db.insert and it appears in the tenant schema', async () => {
    const logs: string[] = [];
    const returnBox = { value: undefined as unknown, set: false };
    const sdk = buildSdk({ pool, tenantSlug }, logs, returnBox);

    const scriptDef = makeScriptDef(`
      const record = await sdk.db.insert('test_records', { name: input.name, value: input.value });
      return record;
    `);

    const result = await runScript(scriptDef, makeCtx(), sdk);

    expect(result.output).toMatchObject({ name: 'hello', value: 42 });

    // Verify it's actually in the DB
    const dbCheck = await pool.query(
      `SELECT * FROM ${schema}.test_records WHERE name = 'hello'`,
    );
    expect(dbCheck.rows.length).toBeGreaterThan(0);
    expect(dbCheck.rows[0].value).toBe(42);
  });

  it('script can query inserted records via sdk.db.query', async () => {
    const logs: string[] = [];
    const returnBox = { value: undefined as unknown, set: false };
    const sdk = buildSdk({ pool, tenantSlug }, logs, returnBox);

    const scriptDef = makeScriptDef(`
      const rows = await sdk.db.query('SELECT name, value FROM test_records WHERE name = $1', [input.name]);
      return rows;
    `);

    const result = await runScript(scriptDef, makeCtx(), sdk);
    const rows = result.output as Array<{ name: string; value: number }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((r) => r.name === 'hello')).toBe(true);
  });
});
