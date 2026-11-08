/**
 * Tests for quote versioning.
 * Integration tests require TEST_DATABASE_URL with platform schema set up.
 */

import { createQuoteVersion, listQuoteVersions, compareQuoteVersions, restoreQuoteVersion, type QuoteVersion } from '@/platform/versioning/quote-versions';
import { Pool } from 'pg';

const TEST_DB = process.env['TEST_DATABASE_URL'];

(TEST_DB ? describe : describe.skip)('quote-versions (integration)', () => {
  let pool: Pool;
  const appId = 'test-app';
  const tenantSlug = 'test_qv_tenant';
  const recordId = 'quote-001';
  const tableApiKey = 'quotes';

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    // Ensure platform schema + table exists
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
    // Set up tenant schema + quotes table
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${tenantSlug}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${tenantSlug}.${tableApiKey} (
        id TEXT PRIMARY KEY,
        total NUMERIC,
        customer TEXT
      )
    `);
    await pool.query(`TRUNCATE ${tenantSlug}.${tableApiKey}`);
    await pool.query(`INSERT INTO ${tenantSlug}.${tableApiKey} VALUES ($1, 1000, 'ACME Corp')`, [recordId]);
    // Clean any prior versions
    await pool.query(`DELETE FROM platform.record_versions WHERE record_id = $1`, [recordId]);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${tenantSlug} CASCADE`);
    await pool.query(`DELETE FROM platform.record_versions WHERE app_id = $1`, [appId]);
    await pool.end();
  });

  let r0: QuoteVersion;

  it('creates R0 (first version)', async () => {
    r0 = await createQuoteVersion(appId, tenantSlug, recordId, tableApiKey, 'user-1', 'Initial quote', pool);
    expect(r0.versionNumber).toBe(0);
    expect(r0.label).toBe('R0');
    expect(r0.note).toBe('Initial quote');
    expect(r0.recordSnapshot).toBeDefined();
  });

  it('creates R1 after updating the record', async () => {
    // Simulate an update
    await pool.query(`UPDATE ${tenantSlug}.${tableApiKey} SET total = 1500 WHERE id = $1`, [recordId]);
    const r1 = await createQuoteVersion(appId, tenantSlug, recordId, tableApiKey, 'user-1', 'Price revision', pool);
    expect(r1.versionNumber).toBe(1);
    expect(r1.label).toBe('R1');
  });

  it('lists versions in order', async () => {
    const versions = await listQuoteVersions(recordId, pool);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0].versionNumber).toBe(0);
    expect(versions[1].versionNumber).toBe(1);
  });

  it('compare diff between R0 and R1 shows total changed', async () => {
    const diff = await compareQuoteVersions(recordId, 0, 1, pool);
    const totalDiff = diff.find((d) => d.field === 'total');
    expect(totalDiff).toBeDefined();
    expect(Number(totalDiff!.before)).toBe(1000);
    expect(Number(totalDiff!.after)).toBe(1500);
  });

  it('restores R0 and creates a new version', async () => {
    const before = await listQuoteVersions(recordId, pool);
    await restoreQuoteVersion(appId, tenantSlug, recordId, tableApiKey, 0, 'user-1', pool);
    const after = await listQuoteVersions(recordId, pool);
    expect(after.length).toBe(before.length + 1);
    // Check the restore note
    const restored = after[after.length - 1];
    expect(restored.note).toMatch(/Restored from R0/);
  });
});
