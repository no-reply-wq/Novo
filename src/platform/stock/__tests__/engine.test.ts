import { Pool, PoolClient, QueryResult } from 'pg';
import { postStockMovement, reverseStockMovement, getStockBalance, getStockReport, fifoBatches, InsufficientStockError } from '../engine';
import type { StockConfig } from '../types';

type QueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult>;
function makeClient(queryFn: QueryFn): PoolClient { return { query: queryFn, release: jest.fn() } as unknown as PoolClient; }
function makePool(queryFn: QueryFn): Pool { return { query: queryFn, connect: jest.fn().mockResolvedValue({ query: queryFn, release: jest.fn() }) } as unknown as Pool; }

const BASE_CONFIG: StockConfig = { tableId: 'purchase_order', itemField: 'item_id', locationField: 'warehouse_id', qtyField: 'qty', direction: 'in' };

describe('postStockMovement', () => {
  it('inserts an IN movement and returns a StockMovement', async () => {
    const record = { id: 'po-1', item_id: 'item-A', warehouse_id: 'wh-1', qty: 10 };
    const client = makeClient(async () => ({ rows: [{ id: 'mv-1', direction: 'in', qty: 10, posted_at: new Date().toISOString() }], rowCount: 1 } as unknown as QueryResult));
    const mv = await postStockMovement('acme', BASE_CONFIG, record, client);
    expect(mv.direction).toBe('in');
    expect(mv.qty).toBe(10);
    expect(mv.itemId).toBe('item-A');
  });

  it('succeeds for an OUT movement when stock is sufficient', async () => {
    const config: StockConfig = { ...BASE_CONFIG, direction: 'out' };
    const record = { id: 'do-1', item_id: 'item-A', warehouse_id: 'wh-1', qty: 5 };
    const client = makeClient(async (sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ balance: '20' }], rowCount: 1 } as unknown as QueryResult;
      return { rows: [{ id: 'mv-2', direction: 'out', qty: 5, posted_at: new Date().toISOString() }], rowCount: 1 } as unknown as QueryResult;
    });
    const mv = await postStockMovement('acme', config, record, client);
    expect(mv.direction).toBe('out');
    expect(mv.qty).toBe(5);
  });

  it('throws InsufficientStockError for OUT when balance is too low', async () => {
    const config: StockConfig = { ...BASE_CONFIG, direction: 'out' };
    const record = { id: 'do-2', item_id: 'item-B', warehouse_id: 'wh-1', qty: 100 };
    const client = makeClient(async (sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ balance: '5' }], rowCount: 1 } as unknown as QueryResult;
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    });
    await expect(postStockMovement('acme', config, record, client)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('throws when trigger status does not match', async () => {
    const config: StockConfig = { ...BASE_CONFIG, triggerStatus: 'Approved' };
    const record = { id: 'po-2', item_id: 'item-A', warehouse_id: 'wh-1', qty: 10, status: 'Draft' };
    const client = makeClient(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));
    await expect(postStockMovement('acme', config, record, client)).rejects.toThrow('Stock trigger not met');
  });

  it('resolves direction from expression config', async () => {
    const config: StockConfig = { ...BASE_CONFIG, direction: 'expression', directionExpr: 'in' };
    const record = { id: 'po-3', item_id: 'item-A', warehouse_id: 'wh-1', qty: 3 };
    const client = makeClient(async () => ({ rows: [{ id: 'mv-3', direction: 'in', qty: 3, posted_at: new Date().toISOString() }], rowCount: 1 } as unknown as QueryResult));
    const mv = await postStockMovement('acme', config, record, client);
    expect(mv.direction).toBe('in');
  });
});

describe('reverseStockMovement', () => {
  it('inserts a mirror movement and marks original as reversed', async () => {
    const queries: string[] = [];
    const client = makeClient(async (sql) => {
      queries.push(sql);
      if (sql.includes('SELECT *')) return { rows: [{ id: 'mv-orig', direction: 'in', qty: 10, item_id: 'item-A', location_id: 'wh-1', batch_id: null }], rowCount: 1 } as unknown as QueryResult;
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    });
    await reverseStockMovement('acme', 'purchase_order', 'po-1', client);
    expect(queries.some((q) => q.includes('INSERT INTO') && q.includes('reversal_id'))).toBe(true);
    expect(queries.some((q) => q.includes('UPDATE') && q.includes('reversed = true'))).toBe(true);
  });

  it('is a no-op when there are no movements to reverse', async () => {
    const queries: string[] = [];
    const client = makeClient(async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 } as unknown as QueryResult; });
    await reverseStockMovement('acme', 'purchase_order', 'po-999', client);
    expect(queries.some((q) => q.includes('INSERT INTO'))).toBe(false);
  });
});

describe('getStockBalance', () => {
  it('returns a StockBalance with the correct shape', async () => {
    const pool = makePool(async () => ({ rows: [{ balance: '15' }], rowCount: 1 } as unknown as QueryResult));
    const balance = await getStockBalance(pool, 'acme', 'item-A', 'wh-1');
    expect(balance).toMatchObject({ itemId: 'item-A', locationId: 'wh-1', availableQty: expect.any(Number), reservedQty: 0, onOrderQty: 0 });
  });

  it('filters by batchNo when provided', async () => {
    let capturedParams: unknown[] = [];
    const pool = makePool(async (_sql, params) => { capturedParams = params ?? []; return { rows: [{ balance: '5' }], rowCount: 1 } as unknown as QueryResult; });
    await getStockBalance(pool, 'acme', 'item-A', 'wh-1', 'BATCH-001');
    expect(capturedParams).toContain('BATCH-001');
  });
});

describe('getStockReport', () => {
  it('returns a list of StockBalance rows', async () => {
    const pool = makePool(async () => ({ rows: [{ item_id: 'item-A', location_id: 'wh-1', batch_id: null, balance: '10' }, { item_id: 'item-B', location_id: 'wh-1', batch_id: null, balance: '20' }], rowCount: 2 } as unknown as QueryResult));
    const report = await getStockReport(pool, 'acme');
    expect(report).toHaveLength(2);
    expect(report[0].itemId).toBe('item-A');
    expect(report[1].availableQty).toBe(20);
  });

  it('applies locationId filter', async () => {
    let capturedSql = '';
    const pool = makePool(async (sql) => { capturedSql = sql; return { rows: [], rowCount: 0 } as unknown as QueryResult; });
    await getStockReport(pool, 'acme', { locationId: 'wh-2' });
    expect(capturedSql).toContain('location_id');
  });

  it('applies itemId filter', async () => {
    let capturedSql = '';
    const pool = makePool(async (sql) => { capturedSql = sql; return { rows: [], rowCount: 0 } as unknown as QueryResult; });
    await getStockReport(pool, 'acme', { itemId: 'item-X' });
    expect(capturedSql).toContain('item_id');
  });
});

describe('fifoBatches', () => {
  it('returns allocations for a single batch', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('GROUP BY')) return { rows: [{ batch_id: 'B1', balance: '50', posted_at: new Date() }], rowCount: 1 } as unknown as QueryResult;
      return { rows: [{ id: 'mv-fifo', direction: 'out', qty: 10, posted_at: new Date().toISOString() }], rowCount: 1 } as unknown as QueryResult;
    });
    const allocs = await fifoBatches(pool, 'acme', 'item-A', 'wh-1', 10);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].qty).toBe(10);
  });

  it('throws InsufficientStockError when stock is insufficient', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));
    await expect(fifoBatches(pool, 'acme', 'item-X', 'wh-1', 100)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('allocates across multiple batches in FIFO order', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('GROUP BY')) return { rows: [{ batch_id: 'B1', balance: '8', posted_at: new Date(2024, 0, 1) }, { batch_id: 'B2', balance: '15', posted_at: new Date(2024, 0, 2) }], rowCount: 2 } as unknown as QueryResult;
      return { rows: [{ id: 'mv-fifo', direction: 'out', qty: 5, posted_at: new Date().toISOString() }], rowCount: 1 } as unknown as QueryResult;
    });
    const allocs = await fifoBatches(pool, 'acme', 'item-A', 'wh-1', 12);
    expect(allocs.length).toBeGreaterThan(0);
    expect(allocs.reduce((s, a) => s + a.qty, 0)).toBe(12);
  });
});
