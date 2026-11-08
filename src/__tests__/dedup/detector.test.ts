/**
 * Unit tests for dedup detector (no DB for pure logic tests).
 * DB-integrated tests are skipped when TEST_DATABASE_URL is absent.
 */

import { levenshtein, similarity, checkDuplicate, type DedupRule } from '@/platform/dedup/detector';
import { Pool } from 'pg';

// ─── Pure function tests ──────────────────────────────────────────────────────

describe('levenshtein (via detector)', () => {
  it('exact same string = 0', () => expect(levenshtein('abc', 'abc')).toBe(0));
  it('one insertion', () => expect(levenshtein('ab', 'abc')).toBe(1));
});

describe('similarity (via detector)', () => {
  it('identical = 1', () => expect(similarity('test', 'test')).toBe(1));
  it('completely different < 0.5', () => expect(similarity('abc', 'xyz')).toBeLessThan(0.5));
});

// ─── DB-backed tests (skipped when no test DB) ────────────────────────────────

const TEST_DB = process.env['TEST_DATABASE_URL'];

(TEST_DB ? describe : describe.skip)('checkDuplicate (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS test_dedup_tenant`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_dedup_tenant.contacts (
        id TEXT PRIMARY KEY,
        email TEXT,
        phone TEXT,
        name TEXT
      )
    `);
    await pool.query(`TRUNCATE test_dedup_tenant.contacts`);
    await pool.query(`INSERT INTO test_dedup_tenant.contacts VALUES ('rec-1','alice@example.com','1234567890','Alice Smith')`);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS test_dedup_tenant CASCADE`);
    await pool.end();
  });

  const rule: DedupRule = {
    tableApiKey: 'contacts',
    matchFields: ['email'],
    matchType: 'exact',
    action: 'warn',
  };

  it('exact match found', async () => {
    const result = await checkDuplicate(
      { email: 'alice@example.com' },
      rule,
      'app-1',
      'test_dedup_tenant',
      pool,
    );
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.existingRecordId).toBe('rec-1');
  });

  it('exact match not found', async () => {
    const result = await checkDuplicate(
      { email: 'bob@example.com' },
      rule,
      'app-1',
      'test_dedup_tenant',
      pool,
    );
    expect(result.isDuplicate).toBe(false);
  });

  it('fuzzy match above threshold', async () => {
    const fuzzyRule: DedupRule = {
      tableApiKey: 'contacts',
      matchFields: ['name'],
      matchType: 'fuzzy',
      fuzzyThreshold: 0.8,
      action: 'warn',
    };
    const result = await checkDuplicate(
      { name: 'Alice Smth' },   // typo — close enough
      fuzzyRule,
      'app-1',
      'test_dedup_tenant',
      pool,
    );
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('fuzzy miss below threshold', async () => {
    const fuzzyRule: DedupRule = {
      tableApiKey: 'contacts',
      matchFields: ['name'],
      matchType: 'fuzzy',
      fuzzyThreshold: 0.95,
      action: 'warn',
    };
    const result = await checkDuplicate(
      { name: 'Completely Different Person' },
      fuzzyRule,
      'app-1',
      'test_dedup_tenant',
      pool,
    );
    expect(result.isDuplicate).toBe(false);
  });
});
