/**
 * Unit tests for availability checks and FIFO draw-down.
 * Uses mock pool — no database needed.
 */

import { Pool, QueryResult } from 'pg';
import { checkAvailability, drawDown } from '../availability';
import { InsufficientStockError } from '../errors';

type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

function makeMockPool(queryFn: QueryFn): Pool {
  return { query: queryFn } as unknown as Pool;
}

// ─── checkAvailability ────────────────────────────────────────────────────────

describe('checkAvailability', () => {
  it('returns sufficient=true when available >= required', async () => {
    const pool = makeMockPool(async () => ({ rows: [{ balance: '20' }], rowCount: 1 } as QueryResult));
    const result = await checkAvailability(pool, 'acme', 'item-1', 'loc-1', 15);
    expect(result.available).toBe(20);
    expect(result.sufficient).toBe(true);
  });

  it('returns sufficient=false when available < required', async () => {
    const pool = makeMockPool(async () => ({ rows: [{ balance: '5' }], rowCount: 1 } as QueryResult));
    const result = await checkAvailability(pool, 'acme', 'item-1', 'loc-1', 10);
    expect(result.available).toBe(5);
    expect(result.sufficient).toBe(false);
  });

  it('returns sufficient=true at exact boundary', async () => {
    const pool = makeMockPool(async () => ({ rows: [{ balance: '10' }], rowCount: 1 } as QueryResult));
    const result = await checkAvailability(pool, 'acme', 'item-1', 'loc-1', 10);
    expect(result.sufficient).toBe(true);
  });
});

// ─── drawDown FIFO ────────────────────────────────────────────────────────────

describe('drawDown - FIFO', () => {
  it('consumes from a single batch when sufficient', async () => {
    const batches = [
      { batch_id: 'batch-1', first_posted_at: new Date().toISOString(), balance: '20' },
    ];

    // Track calls: first query = SELECT batches, subsequent = postMovement INSERT
    let callCount = 0;
    const pool = makeMockPool(async () => {
      callCount++;
      if (callCount === 1) return { rows: batches, rowCount: 1 } as QueryResult;
      // postMovement INSERT
      return {
        rows: [{
          id: 'mov-out-1',
          tenant_slug: 'acme',
          item_id: 'item-1',
          location_id: 'loc-1',
          batch_id: 'batch-1',
          direction: 'out',
          qty: '10',
          source_table_id: 'draw_down',
          source_record_id: '',
          posted_at: new Date().toISOString(),
          posted_by: 'system',
          reversed: false,
          reversal_id: null,
        }],
        rowCount: 1,
      } as QueryResult;
    });

    const result = await drawDown(pool, 'acme', 'item-1', 'loc-1', 10, 'FIFO');
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe('batch-1');
    expect(result.allocations[0].qty).toBe(10);
    expect(result.movements).toHaveLength(1);
  });

  it('spans multiple batches when first is not enough', async () => {
    const batches = [
      { batch_id: 'batch-1', first_posted_at: new Date(2024, 0, 1).toISOString(), balance: '6' },
      { batch_id: 'batch-2', first_posted_at: new Date(2024, 0, 2).toISOString(), balance: '10' },
    ];

    let callCount = 0;
    const pool = makeMockPool(async (text: string) => {
      if (text.includes('GROUP BY')) {
        return { rows: batches, rowCount: 2 } as QueryResult;
      }
      // postMovement calls
      callCount++;
      const batchId = callCount === 1 ? 'batch-1' : 'batch-2';
      const qty = callCount === 1 ? '6' : '4';
      return {
        rows: [{
          id: `mov-${callCount}`,
          tenant_slug: 'acme',
          item_id: 'item-1',
          location_id: 'loc-1',
          batch_id: batchId,
          direction: 'out',
          qty,
          source_table_id: 'draw_down',
          source_record_id: '',
          posted_at: new Date().toISOString(),
          posted_by: 'system',
          reversed: false,
          reversal_id: null,
        }],
        rowCount: 1,
      } as QueryResult;
    });

    const result = await drawDown(pool, 'acme', 'item-1', 'loc-1', 10, 'FIFO');
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].qty).toBe(6);
    expect(result.allocations[1].qty).toBe(4);
  });

  it('throws InsufficientStockError when total available < required', async () => {
    const pool = makeMockPool(async () => ({
      rows: [{ batch_id: null, first_posted_at: new Date().toISOString(), balance: '3' }],
      rowCount: 1,
    } as QueryResult));

    await expect(
      drawDown(pool, 'acme', 'item-1', 'loc-1', 100, 'FIFO'),
    ).rejects.toThrow(InsufficientStockError);
  });

  it('throws InsufficientStockError when no stock at all', async () => {
    const pool = makeMockPool(async () => ({ rows: [], rowCount: 0 } as QueryResult));

    await expect(
      drawDown(pool, 'acme', 'item-1', 'loc-1', 1, 'FIFO'),
    ).rejects.toThrow(InsufficientStockError);
  });

  it('uses FIFO ordering (MIN posted_at ASC)', async () => {
    const queries: string[] = [];
    const pool = makeMockPool(async (text: string) => {
      queries.push(text);
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await drawDown(pool, 'acme', 'item-1', 'loc-1', 1, 'FIFO').catch(() => {});
    expect(queries[0]).toContain('MIN(posted_at) ASC');
  });

  it('uses FEFO ordering (batch_id ASC)', async () => {
    const queries: string[] = [];
    const pool = makeMockPool(async (text: string) => {
      queries.push(text);
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await drawDown(pool, 'acme', 'item-1', 'loc-1', 1, 'FEFO').catch(() => {});
    expect(queries[0]).toContain('batch_id ASC');
  });
});
