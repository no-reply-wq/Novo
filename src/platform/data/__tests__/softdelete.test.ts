/**
 * Tests for soft-delete module using a mock DB client.
 */

import { softDelete, restoreRecord, listRecycleBin } from '../softdelete';
import type { PoolClient } from 'pg';

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

function makeUpdateDb(rowCount: number): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rowCount }),
  } as unknown as PoolClient;
}

function makeQueryDb(rows: Record<string, unknown>[]): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as PoolClient;
}

// ─── softDelete ───────────────────────────────────────────────────────────────

describe('softDelete', () => {
  it('calls UPDATE with deleted_at, deleted_by, delete_reason', async () => {
    const db = makeUpdateDb(1);
    await softDelete('myco', 'orders', 'record-uuid', 'No longer needed', 'user-uuid', db);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SET deleted_at'),
      ['user-uuid', 'No longer needed', 'record-uuid'],
    );
  });

  it('throws when record not found', async () => {
    const db = makeUpdateDb(0);
    await expect(
      softDelete('myco', 'orders', 'missing-uuid', 'reason', 'user-uuid', db),
    ).rejects.toThrow('not found or already deleted');
  });

  it('stores null reason when empty string given', async () => {
    const db = makeUpdateDb(1);
    await softDelete('myco', 'orders', 'record-uuid', '', 'user-uuid', db);
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      ['user-uuid', null, 'record-uuid'],
    );
  });
});

// ─── restoreRecord ────────────────────────────────────────────────────────────

describe('restoreRecord', () => {
  it('calls UPDATE to clear deleted columns', async () => {
    const db = makeUpdateDb(1);
    await restoreRecord('myco', 'orders', 'record-uuid', db);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at     = NULL'),
      ['record-uuid'],
    );
  });

  it('throws when record not deleted', async () => {
    const db = makeUpdateDb(0);
    await expect(
      restoreRecord('myco', 'orders', 'active-uuid', db),
    ).rejects.toThrow('not found or not deleted');
  });
});

// ─── listRecycleBin ───────────────────────────────────────────────────────────

describe('listRecycleBin', () => {
  const fakeRows = [
    {
      id: 'uuid-1',
      deleted_at: new Date('2026-01-01'),
      deleted_by: 'user-1',
      delete_reason: 'Mistake',
      name: 'Order #1',
    },
    {
      id: 'uuid-2',
      deleted_at: new Date('2026-01-02'),
      deleted_by: 'user-2',
      delete_reason: null,
      name: 'Order #2',
    },
  ];

  it('returns mapped SoftDeletedRecord objects', async () => {
    const db = makeQueryDb(fakeRows);
    const results = await listRecycleBin('myco', 'orders', db);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('uuid-1');
    expect(results[0].deletedBy).toBe('user-1');
    expect(results[0].deleteReason).toBe('Mistake');
    expect(results[1].deleteReason).toBeNull();
  });

  it('passes limit and offset', async () => {
    const db = makeQueryDb([]);
    await listRecycleBin('myco', 'orders', db, 25, 50);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1 OFFSET $2'),
      [25, 50],
    );
  });

  it('uses tenant schema in query', async () => {
    const db = makeQueryDb([]);
    await listRecycleBin('acme', 'sales_orders', db);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('"tenant_acme"'),
      expect.anything(),
    );
  });
});
