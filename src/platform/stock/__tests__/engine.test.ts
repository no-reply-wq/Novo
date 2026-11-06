/**
 * Tests for the Wave 10 stock engine façade.
 * Covers: postStockMovement, reverseStockMovement, getStockBalance,
 *         getStockReport, fifoBatches, and InsufficientStockError.
 *
 * All database calls are mocked — no real Postgres required.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import {
  getStockBalance,
  getStockReport,
  InsufficientStockError,
  postStockMovement,
  reverseStockMovement,
} from '../engine';
import type { StockConfig } from '../types';

// ─── Shared helpers ───────────────────────────────────────────────────────────

type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

function makePool(queryFn: QueryFn): Pool {
  return { query: queryFn } as unknown as Pool;
}

function makeClientFn(queryFn: QueryFn): PoolClient {
  return {
    query: queryFn,
    release: jest.fn(),
  } as unknown as PoolClient;
}

const BASE_CONFIG: StockConfig = {
  tableId: 'grn_table',
  itemField: 'item_id',
  locationField: 'location_id',
  qtyField: 'qty',
  direction: 'in',
};

function movementRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mov-1',
    tenant_slug: 'acme',
    item_id: 'item-1',
    location_id: 'loc-1',
    batch_id: null,
    direction: 'in',
    qty: '10',
    source_table_id: 'grn_table',
    source_record_id: 'rec-1',
    posted_at: new Date().toISOString(),
    posted_by: 'system',
    reversed: false,
    reversal_id: null,
    ...overrides,
  };
}

// ─── postStockMovement ────────────────────────────────────────────────────────

describe('postStockMovement', () => {
  it('posts an IN movement without stock check', async () => {
    const record = { id: 'rec-1', item_id: 'item-1', location_id: 'loc-1', qty: 10 };
    const client = makeClientFn(async () => ({
      rows: [movementRow()],
      rowCount: 1,
    } as QueryResult));

    const result = await postStockMovement('acme', BASE_CONFIG, record, client);
    expect(result.direction).toBe('in');
    expect(result.qty).toBe(10);
    expect(result.itemId).toBe('item-1');
  });

  it('posts an OUT movement when stock is sufficient', async () => {
    const config: StockConfig = { ...BASE_CONFIG, direction: 'out' };
    const record = { id: 'rec-2', item_id: 'item-1', location_id: 'loc-1', qty: 5 };

    let callNum = 0;
    const client = makeClientFn(async () => {
      callNum++;
      if (callNum === 1) {
        // FOR UPDATE balance check
        return { rows: [{ balance: '20' }], rowCount: 1 } as QueryResult;
      }
      // INSERT movement
      return { rows: [movementRow({ direction: 'out', qty: '5' })], rowCount: 1 } as QueryResult;
    });

    const result = await postStockMovement('acme', config, record, client);
    expect(result.direction).toBe('out');
    expect(result.qty).toBe(5);
  });

  it('throws InsufficientStockError when available < required for OUT', async () => {
    const config: StockConfig = { ...BASE_CONFIG, direction: 'out' };
    const record = { id: 'rec-3', item_id: 'item-1', location_id: 'loc-1', qty: 100 };

    const client = makeClientFn(async () => ({
      rows: [{ balance: '5' }],
      rowCount: 1,
    } as QueryResult));

    await expect(postStockMovement('acme', config, record, client)).rejects.toThrow(
      InsufficientStockError,
    );
  });

  it('throws when trigger status does not match', async () => {
    const config: StockConfig = { ...BASE_CONFIG, triggerStatus: 'approved' };
    const record = { id: 'rec-4', item_id: 'i', location_id: 'l', qty: 1, status: 'draft' };
    const client = makeClientFn(async () => ({ rows: [], rowCount: 0 } as QueryResult));

    await expect(postStockMovement('acme', config, record, client)).rejects.toThrow(
      'Stock trigger not met',
    );
  });

  it('resolves direction via expression', async () => {
    const config: StockConfig = {
      ...BASE_CONFIG,
      direction: 'expression',
      directionExpr: 'out',
    };
    const record = { id: 'rec-5', item_id: 'i', location_id: 'l', qty: 3 };

    let balanceChecked = false;
    const client = makeClientFn(async (sql) => {
      if (sql.includes('FOR UPDATE')) {
        balanceChecked = true;
        return { rows: [{ balance: '50' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [movementRow({ direction: 'out', qty: '3' })], rowCount: 1 } as QueryResult;
    });

    const result = await postStockMovement('acme', config, record, client);
    expect(balanceChecked).toBe(true);
    expect(result.direction).toBe('out');
  });
});

// ─── reverseStockMovement ─────────────────────────────────────────────────────

describe('reverseStockMovement', () => {
  it('inserts a mirror movement and marks original reversed', async () => {
    const original = movementRow({ id: 'orig-1', direction: 'in', qty: '10', reversed: false });

    const queries: string[] = [];
    const client = makeClientFn(async (sql) => {
      queries.push(sql);
      if (sql.includes('FOR UPDATE')) return { rows: [original], rowCount: 1 } as QueryResult;
      return { rows: [], rowCount: 1 } as QueryResult;
    });

    await reverseStockMovement('acme', 'grn_table', 'rec-1', client);

    const insertCall = queries.find((q) => q.includes('INSERT'));
    const updateCall = queries.find((q) => q.includes('UPDATE'));
    expect(insertCall).toBeDefined();
    expect(updateCall).toBeDefined();
  });

  it('is a no-op when no movements match', async () => {
    const queries: string[] = [];
    const client = makeClientFn(async (sql) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await reverseStockMovement('acme', 'grn_table', 'missing-rec', client);
    // Only the SELECT FOR UPDATE should run; no INSERT or UPDATE
    expect(queries.filter((q) => q.includes('INSERT'))).toHaveLength(0);
  });
});

// ─── getStockBalance ──────────────────────────────────────────────────────────

describe('getStockBalance', () => {
  it('returns balance with correct shape', async () => {
    const pool = makePool(async () => ({ rows: [{ balance: '25' }], rowCount: 1 } as QueryResult));
    const balance = await getStockBalance(pool, 'acme', 'item-1', 'loc-1');

    expect(balance.availableQty).toBe(25);
    expect(balance.reservedQty).toBe(0);
    expect(balance.onOrderQty).toBe(0);
    expect(balance.itemId).toBe('item-1');
    expect(balance.locationId).toBe('loc-1');
  });

  it('filters by batchNo when provided', async () => {
    const queries: string[] = [];
    const pool = makePool(async (sql) => {
      queries.push(sql);
      return { rows: [{ balance: '8' }], rowCount: 1 } as QueryResult;
    });

    await getStockBalance(pool, 'acme', 'item-1', 'loc-1', 'batch-X');
    expect(queries[0]).toContain('batch_id = $4');
  });
});

// ─── getStockReport ───────────────────────────────────────────────────────────

describe('getStockReport', () => {
  it('returns a list of balances', async () => {
    const rows = [
      { item_id: 'item-1', location_id: 'loc-1', batch_id: null, balance: '10' },
      { item_id: 'item-2', location_id: 'loc-1', batch_id: 'B01', balance: '5' },
    ];
    const pool = makePool(async () => ({ rows, rowCount: 2 } as QueryResult));

    const report = await getStockReport(pool, 'acme');
    expect(report).toHaveLength(2);
    expect(report[0].availableQty).toBe(10);
    expect(report[1].batchNo).toBe('B01');
  });

  it('applies locationId filter', async () => {
    const queries: string[] = [];
    const pool = makePool(async (sql) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await getStockReport(pool, 'acme', { locationId: 'wh-east' });
    expect(queries[0]).toContain('location_id = $2');
  });

  it('applies itemId filter', async () => {
    const queries: string[] = [];
    const pool = makePool(async (sql) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await getStockReport(pool, 'acme', { itemId: 'SKU-100' });
    expect(queries[0]).toContain('item_id = $2');
  });
});

// ─── fifoBatches (draw-down) ──────────────────────────────────────────────────

describe('fifoBatches', () => {
  it('returns FIFO allocations for available stock', async () => {
    const batches = [
      { batch_id: 'batch-A', first_posted_at: new Date(2024, 0, 1).toISOString(), balance: '20' },
    ];

    let callCount = 0;
    const pool = makePool(async () => {
      callCount++;
      if (callCount === 1) return { rows: batches, rowCount: 1 } as QueryResult;
      // postMovement INSERT called by drawDown
      return {
        rows: [movementRow({ batch_id: 'batch-A', direction: 'out', qty: '10' })],
        rowCount: 1,
      } as QueryResult;
    });

    const allocations = await fifoBatches(pool, 'acme', 'item-1', 'loc-1', 10);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].batchNo).toBe('batch-A');
    expect(allocations[0].qty).toBe(10);
  });

  it('throws InsufficientStockError when stock is not enough', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 } as QueryResult));
    await expect(fifoBatches(pool, 'acme', 'item-1', 'loc-1', 5)).rejects.toThrow(
      InsufficientStockError,
    );
  });

  it('spans multiple batches in FIFO order', async () => {
    const batches = [
      { batch_id: 'batch-1', first_posted_at: new Date(2024, 0, 1).toISOString(), balance: '6' },
      { batch_id: 'batch-2', first_posted_at: new Date(2024, 0, 5).toISOString(), balance: '10' },
    ];

    let insertCount = 0;
    const pool = makePool(async (sql) => {
      if (sql.includes('GROUP BY')) return { rows: batches, rowCount: 2 } as QueryResult;
      insertCount++;
      return {
        rows: [movementRow({ batch_id: `batch-${insertCount}`, direction: 'out', qty: insertCount === 1 ? '6' : '4' })],
        rowCount: 1,
      } as QueryResult;
    });

    const allocations = await fifoBatches(pool, 'acme', 'item-1', 'loc-1', 10);
    expect(allocations).toHaveLength(2);
    expect(allocations[0].qty).toBe(6);
    expect(allocations[1].qty).toBe(4);
  });
});

// Re-import fifoBatches (it's re-exported from engine.ts)
import { fifoBatches } from '../engine';
