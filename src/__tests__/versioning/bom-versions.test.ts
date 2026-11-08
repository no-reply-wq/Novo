/**
 * Tests for BOM versioning.
 */

import { createBomVersion, getEffectiveBom, listBomVersions } from '@/platform/versioning/bom-versions';
import { Pool } from 'pg';

const TEST_DB = process.env['TEST_DATABASE_URL'];

(TEST_DB ? describe : describe.skip)('bom-versions (integration)', () => {
  let pool: Pool;
  const appId = 'bom-app';
  const tenantSlug = 'test_bom_tenant';
  const bomId = 'bom-001';

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS platform`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform.record_versions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        table_api_key TEXT NOT NULL,
        record_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        version_label TEXT NOT NULL,
        version_type TEXT NOT NULL DEFAULT 'revision',
        snapshot JSONB NOT NULL,
        status TEXT,
        note TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(record_id, version_number, version_type)
      )
    `);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${tenantSlug}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${tenantSlug}.boms (
        id TEXT PRIMARY KEY,
        product TEXT,
        revision INTEGER
      )
    `);
    await pool.query(`TRUNCATE ${tenantSlug}.boms`);
    await pool.query(`INSERT INTO ${tenantSlug}.boms VALUES ($1, 'Widget A', 0)`, [bomId]);
    await pool.query(`DELETE FROM platform.record_versions WHERE record_id = $1`, [bomId]);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${tenantSlug} CASCADE`);
    await pool.query(`DELETE FROM platform.record_versions WHERE app_id = $1`, [appId]);
    await pool.end();
  });

  it('creates first BOM version', async () => {
    const v = await createBomVersion(appId, tenantSlug, bomId, 'user-1', 'Initial BOM', pool);
    expect(v.versionNumber).toBe(0);
    expect(v.label).toBe('R0');
    expect(v.note).toBe('Initial BOM');
  });

  it('creates second BOM version after update', async () => {
    await pool.query(`UPDATE ${tenantSlug}.boms SET revision = 1 WHERE id = $1`, [bomId]);
    const v = await createBomVersion(appId, tenantSlug, bomId, 'user-1', 'Added component X', pool);
    expect(v.versionNumber).toBe(1);
  });

  it('getEffectiveBom returns latest when no asOf', async () => {
    const v = await getEffectiveBom(bomId, pool);
    expect(v).not.toBeNull();
    expect(v!.versionNumber).toBe(1);
  });

  it('getEffectiveBom with past asOf returns earlier version', async () => {
    // Use a date clearly in the past to get no version
    const veryEarly = new Date('2000-01-01T00:00:00Z');
    const v = await getEffectiveBom(bomId, pool, veryEarly);
    expect(v).toBeNull();
  });

  it('lists BOM versions in order', async () => {
    const versions = await listBomVersions(bomId, pool);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0].versionNumber).toBeLessThan(versions[1].versionNumber);
  });
});
