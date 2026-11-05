/**
 * Unit tests for the stock ledger.
 * Uses a mock pool — no real database required.
 */

import { Pool, QueryResult } from 'pg';
import {
  postMovement,
  getAvailableStock,
  reverseMovement,
  StockMovement,
} from '../ledger';
import {
  MovementAlreadyReversedError,
  StockError,
} from '../errors';

// ─── Mock pool factory ────────────────────────────────────────────────────────

type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

function makeMockPool(queryFn: QueryFn): Pool {
  const pool = {
    query: queryFn,
    connect: jest.fn(),
  };
  return pool as unknown as Pool;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMovementRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'mov-1',
    tenant_slug: 'acme',
    item_id: 'item-1',
    location_id: 'loc-1',
    batch_id: null,
    direction: 'in',
    qty: '10',
    source_table_id: 'grn',
    source_record_id: 'rec-1',
    posted_at: new Date().toISOString(),
    posted_by: 'user-1',
    reversed: false,
    reversal_id: null,
    ...overrides,
  };
}

// ─── postMovement ─────────────────────────────────────────────────────────────

describe('postMovement', () => {
  it('inserts a movement and returns it', async () => {
    const row = makeMovementRow();
    const pool = makeMockPool(async () => ({ rows: [row], rowCount: 1 } as QueryResult));

    const result = await postMovement(pool, 'acme', {
      tenantSlug: 'acme',
      itemId: 'item-1',
      locationId: 'loc-1',
      direction: 'in',
      qty: 10,
      sourceTableId: 'grn',
      sourceRecordId: 'rec-1',
      postedBy: 'user-1',
    });

    expect(result.id).toBe('mov-1');
    expect(result.direction).toBe('in');
    expect(result.qty).toBe(10);
    expect(result.reversed).toBe(false);
  });

  it('throws StockError when qty <= 0', async () => {
    const pool = makeMockPool(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));

    await expect(
      postMovement(pool, 'acme', {
        tenantSlug: 'acme',
        itemId: 'item-1',
        locationId: 'loc-1',
        direction: 'in',
        qty: 0,
        sourceTableId: 'grn',
        sourceRecordId: 'rec-1',
        postedBy: 'user-1',
      }),
    ).rejects.toThrow(StockError);
  });

  it('includes batchId when provided', async () => {
    const row = makeMovementRow({ batch_id: 'batch-A' });
    const pool = makeMockPool(async () => ({ rows: [row], rowCount: 1 } as QueryResult));

    const result = await postMovement(pool, 'acme', {
      tenantSlug: 'acme',
      itemId: 'item-1',
      locationId: 'loc-1',
      batchId: 'batch-A',
      direction: 'in',
      qty: 5,
      sourceTableId: 'grn',
      sourceRecordId: 'rec-1',
      postedBy: 'user-1',
    });

    expect(result.batchId).toBe('batch-A');
  });
});

// ─── getAvailableStock ────────────────────────────────────────────────────────

describe('getAvailableStock', () => {
  it('returns net balance', async () => {
    const pool = makeMockPool(async () => ({ rows: [{ balance: '15' }], rowCount: 1 } as QueryResult));
    const balance = await getAvailableStock(pool, 'acme', 'item-1', 'loc-1');
    expect(balance).toBe(15);
  });

  it('returns 0 when no movements', async () => {
    const pool = makeMockPool(async () => ({ rows: [{ balance: '0' }], rowCount: 1 } as QueryResult));
    const balance = await getAvailableStock(pool, 'acme', 'item-1', 'loc-1');
    expect(balance).toBe(0);
  });

  it('filters by batchId when provided', async () => {
    const queries: string[] = [];
    const pool = makeMockPool(async (text: string) => {
      queries.push(text);
      return { rows: [{ balance: '8' }], rowCount: 1 } as QueryResult;
    });

    const balance = await getAvailableStock(pool, 'acme', 'item-1', 'loc-1', 'batch-X');
    expect(balance).toBe(8);
    expect(queries[0]).toContain('batch_id = $4');
  });
});

// ─── reverseMovement ─────────────────────────────────────────────────────────

describe('reverseMovement', () => {
  it('creates mirror movement with opposite direction', async () => {
    const original = makeMovementRow({ id: 'orig', direction: 'in', qty: '10' });
    const mirror = makeMovementRow({
      id: 'mirror',
      direction: 'out',
      qty: '10',
      reversal_id: 'orig',
      reversed: false,
    });

    let queryCount = 0;
    const pool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockImplementation(async (text: string) => {
          if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
          queryCount++;
          if (queryCount === 1) return { rows: [original], rowCount: 1 }; // SELECT original
          if (queryCount === 2) return { rows: [mirror], rowCount: 1 };   // INSERT mirror
          if (queryCount === 3) return { rows: [], rowCount: 1 };          // UPDATE original
          return { rows: [] };
        }),
        release: jest.fn(),
      }),
    } as unknown as Pool;

    const result = await reverseMovement(pool, 'acme', 'orig', 'user-2');
    expect(result.direction).toBe('out');
    expect(result.reversalId).toBe('orig');
  });

  it('throws MovementAlreadyReversedError when already reversed', async () => {
    const original = makeMovementRow({ id: 'orig', reversed: true });

    const pool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockImplementation(async (text: string) => {
          if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
          return { rows: [original], rowCount: 1 };
        }),
        release: jest.fn(),
      }),
    } as unknown as Pool;

    await expect(reverseMovement(pool, 'acme', 'orig', 'user-2')).rejects.toThrow(
      MovementAlreadyReversedError,
    );
  });

  it('throws StockError when movement not found', async () => {
    const pool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockImplementation(async (text: string) => {
          if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
          return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
      }),
    } as unknown as Pool;

    await expect(reverseMovement(pool, 'acme', 'missing', 'user-2')).rejects.toThrow(
      StockError,
    );
  });
});
