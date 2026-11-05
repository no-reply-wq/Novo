/**
 * Tests for record versions module using a mock DB client.
 */

import { saveVersion, listVersions, restoreVersion } from '../versions';
import type { PoolClient } from 'pg';

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

function makeVersionDb(existingVersionCount: number, rows: Record<string, unknown>[] = []): PoolClient {
  let callCount = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      callCount++;
      // First call is the MAX(version_number) query
      if (callCount === 1) {
        return Promise.resolve({
          rows: [{ next_ver: existingVersionCount + 1 }],
        });
      }
      // Second call is the INSERT
      return Promise.resolve({ rows, rowCount: rows.length });
    }),
  } as unknown as PoolClient;
}

function makeListDb(rows: Record<string, unknown>[]): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as PoolClient;
}

// ─── saveVersion ──────────────────────────────────────────────────────────────

describe('saveVersion', () => {
  it('inserts version with correct params', async () => {
    const db = makeVersionDb(0);
    const data = { name: 'Test', amount: 500 };

    await saveVersion('myco', 'orders', 'rec-uuid', data, 'R1', db, 'user-uuid');

    expect(db.query).toHaveBeenCalledTimes(2);
    // Second call should be the INSERT
    const insertCall = (db.query as jest.Mock).mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO public.record_versions');
    expect(insertCall[1]).toContain('tenant_myco');
    expect(insertCall[1]).toContain('orders');
    expect(insertCall[1]).toContain('rec-uuid');
    expect(insertCall[1]).toContain('R1');
  });

  it('uses version_number from MAX query + 1', async () => {
    const db = makeVersionDb(5); // 5 existing = next is 6
    await saveVersion('myco', 'orders', 'rec-uuid', {}, undefined, db);

    const insertCall = (db.query as jest.Mock).mock.calls[1];
    expect(insertCall[1][3]).toBe(6); // version_number = 6
  });

  it('stores null label when undefined', async () => {
    const db = makeVersionDb(0);
    await saveVersion('myco', 'orders', 'rec-uuid', {}, undefined, db);

    const insertCall = (db.query as jest.Mock).mock.calls[1];
    expect(insertCall[1][4]).toBeNull(); // version_label = null
  });
});

// ─── listVersions ─────────────────────────────────────────────────────────────

describe('listVersions', () => {
  const fakeRows = [
    {
      id: 1,
      tenant_schema: 'tenant_myco',
      table_name: 'orders',
      record_id: 'rec-uuid',
      version_number: 2,
      version_label: 'After approval',
      data: { name: 'v2' },
      saved_by: 'user-1',
      saved_at: new Date('2026-02-01'),
    },
    {
      id: 2,
      tenant_schema: 'tenant_myco',
      table_name: 'orders',
      record_id: 'rec-uuid',
      version_number: 1,
      version_label: null,
      data: { name: 'v1' },
      saved_by: null,
      saved_at: new Date('2026-01-01'),
    },
  ];

  it('returns mapped RecordVersion objects', async () => {
    const db = makeListDb(fakeRows);
    const versions = await listVersions('myco', 'orders', 'rec-uuid', db);

    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(2);
    expect(versions[0].versionLabel).toBe('After approval');
    expect(versions[1].savedBy).toBeNull();
  });

  it('queries with correct parameters', async () => {
    const db = makeListDb([]);
    await listVersions('acme', 'sales', 'rec-id', db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY version_number DESC'),
      ['tenant_acme', 'sales', 'rec-id'],
    );
  });
});

// ─── restoreVersion ───────────────────────────────────────────────────────────

describe('restoreVersion', () => {
  it('returns the data snapshot', async () => {
    const snapshot = { name: 'Old Name', amount: 100 };
    const db = makeListDb([{ data: snapshot }]);
    const result = await restoreVersion('myco', 'orders', 'rec-uuid', 1, db);
    expect(result).toEqual(snapshot);
  });

  it('throws when version not found', async () => {
    const db = makeListDb([]);
    await expect(
      restoreVersion('myco', 'orders', 'rec-uuid', 999, db),
    ).rejects.toThrow('not found');
  });

  it('queries with version_number', async () => {
    const db = makeListDb([{ data: {} }]);
    await restoreVersion('acme', 'orders', 'rec-uuid', 3, db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('AND version_number = $4'),
      ['tenant_acme', 'orders', 'rec-uuid', 3],
    );
  });
});
