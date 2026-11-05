/**
 * Integration tests for autonumber.ts
 */

import { Pool } from 'pg';
import { nextAutoNumber, formatAutoNumber } from '../autonumber';
import { makePool, cleanPlatformTables } from './helpers';

// Use a unique APP_ID per Jest worker + run to avoid counter contamination
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const APP_ID = `app-an-${RUN_ID}`;

let pool: Pool;

beforeAll(async () => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

async function withTx<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

describe('nextAutoNumber', () => {
  it('increments sequentially', async () => {
    const opts = { prefix: 'PO-', padding: 4, resetRule: 'never' as const };
    const seq = 'seq-inc-001';

    const a = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts));
    const b = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts));
    const c = await withTx(c2 => nextAutoNumber(c2, APP_ID, seq, opts));

    expect(a).toBe('PO-0001');
    expect(b).toBe('PO-0002');
    expect(c).toBe('PO-0003');
  });

  it('includes year prefix when includeYear is true', async () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const opts = { prefix: 'PO-', includeYear: true, padding: 4, resetRule: 'never' as const };
    const seq = 'seq-year-001';

    const val = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts, undefined, now));
    expect(val).toBe('PO-2026-0001');
  });

  it('includes location code when includeLocation is true', async () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const opts = { prefix: 'PO-', includeYear: true, includeLocation: true, padding: 4, resetRule: 'never' as const };
    const seq = 'seq-loc-001';

    const val = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts, 'MUM', now));
    expect(val).toBe('PO-2026-MUM-0001');
  });

  it('resets counter on year change', async () => {
    const opts = { prefix: 'INV-', padding: 3, resetRule: 'yearly' as const };
    const seq = 'seq-reset-year-001';

    const y2025 = new Date('2025-06-01T00:00:00Z');
    const y2026 = new Date('2026-01-01T00:00:00Z');

    const a = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts, undefined, y2025));
    const b = await withTx(c => nextAutoNumber(c, APP_ID, seq, opts, undefined, y2025));
    // Now in new year — counter resets
    const c = await withTx(c2 => nextAutoNumber(c2, APP_ID, seq, opts, undefined, y2026));

    expect(a).toBe('INV-001');
    expect(b).toBe('INV-002');
    expect(c).toBe('INV-001'); // reset!
  });
});

describe('formatAutoNumber', () => {
  it('formats with prefix and padding only', () => {
    expect(formatAutoNumber(5, { prefix: 'PO-', padding: 4 })).toBe('PO-0005');
  });

  it('formats with year', () => {
    const now = new Date('2026-11-05');
    expect(formatAutoNumber(1, { prefix: 'X-', includeYear: true, padding: 3 }, undefined, now)).toBe('X-2026-001');
  });
});
