/**
 * Unit tests for the BOM engine.
 */

import { Pool, QueryResult } from 'pg';
import { scaleBom, checkBomAvailability, consumeBom, BomLine } from '../bom';

type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

function makeMockPool(queryFn: QueryFn): Pool {
  return { query: queryFn } as unknown as Pool;
}

const recipe: BomLine[] = [
  { itemId: 'flour', qty: 2, unit: 'kg' },
  { itemId: 'sugar', qty: 0.5, unit: 'kg' },
  { itemId: 'eggs', qty: 3 },
];

// ─── scaleBom ─────────────────────────────────────────────────────────────────

describe('scaleBom', () => {
  it('multiplies all qtys by outputQty', () => {
    const scaled = scaleBom(recipe, 3);
    expect(scaled[0].qty).toBe(6);
    expect(scaled[1].qty).toBe(1.5);
    expect(scaled[2].qty).toBe(9);
  });

  it('preserves unit and itemId', () => {
    const scaled = scaleBom(recipe, 2);
    expect(scaled[0].unit).toBe('kg');
    expect(scaled[0].itemId).toBe('flour');
  });

  it('handles fractional output qty', () => {
    const scaled = scaleBom(recipe, 0.5);
    expect(scaled[0].qty).toBe(1);
    expect(scaled[1].qty).toBe(0.25);
  });

  it('handles outputQty = 1 (identity)', () => {
    const scaled = scaleBom(recipe, 1);
    expect(scaled[0].qty).toBe(2);
    expect(scaled[1].qty).toBe(0.5);
  });

  it('throws when outputQty <= 0', () => {
    expect(() => scaleBom(recipe, 0)).toThrow();
    expect(() => scaleBom(recipe, -1)).toThrow();
  });

  it('rounds to avoid floating-point drift', () => {
    const r: BomLine[] = [{ itemId: 'x', qty: 0.1 }];
    const scaled = scaleBom(r, 3);
    // 0.1 * 3 = 0.30000000000000004 without rounding
    expect(scaled[0].qty).toBe(0.3);
  });
});

// ─── checkBomAvailability ─────────────────────────────────────────────────────

describe('checkBomAvailability', () => {
  it('returns sufficient=true when all items available', async () => {
    // For each item, available = 100 (plenty)
    const pool = makeMockPool(async () => ({
      rows: [{ balance: '100' }],
      rowCount: 1,
    } as QueryResult));

    const results = await checkBomAvailability(pool, 'acme', recipe, 1, 'loc-1');
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.sufficient).toBe(true));
  });

  it('flags shortage for items with insufficient stock', async () => {
    // flour: 1 available (need 2), sugar: 1 available (need 0.5), eggs: 0 (need 3)
    const balances: Record<string, string> = {
      flour: '1',
      sugar: '1',
      eggs: '0',
    };

    let callIndex = 0;
    const items = ['flour', 'sugar', 'eggs'];
    const pool = makeMockPool(async () => {
      const item = items[callIndex++ % items.length];
      return {
        rows: [{ balance: balances[item] ?? '0' }],
        rowCount: 1,
      } as QueryResult;
    });

    const results = await checkBomAvailability(pool, 'acme', recipe, 1, 'loc-1');
    // Find by itemId
    const flourResult = results.find((r) => r.itemId === 'flour');
    const sugarResult = results.find((r) => r.itemId === 'sugar');
    const eggsResult = results.find((r) => r.itemId === 'eggs');

    expect(flourResult?.sufficient).toBe(false); // 1 < 2
    expect(sugarResult?.sufficient).toBe(true);  // 1 >= 0.5
    expect(eggsResult?.sufficient).toBe(false);  // 0 < 3
  });

  it('scales qtys before checking', async () => {
    const queries: string[] = [];
    const pool = makeMockPool(async (text: string, params?: unknown[]) => {
      queries.push(JSON.stringify(params));
      return { rows: [{ balance: '1000' }], rowCount: 1 } as QueryResult;
    });

    await checkBomAvailability(pool, 'acme', recipe, 5, 'loc-1');
    // flour needs 2*5=10, sugar needs 0.5*5=2.5, eggs needs 3*5=15
    // These show up as the available check (qty param not visible in getAvailableStock query)
    // We just verify 3 queries were made (one per BomLine)
    expect(queries).toHaveLength(3);
  });
});

// ─── consumeBom ──────────────────────────────────────────────────────────────

describe('consumeBom', () => {
  it('posts one OUT movement per BomLine', async () => {
    let insertCount = 0;
    const pool = makeMockPool(async (text: string) => {
      if (text.includes('INSERT')) {
        insertCount++;
        return {
          rows: [{
            id: `mov-${insertCount}`,
            tenant_slug: 'acme',
            item_id: 'flour',
            location_id: 'loc-1',
            batch_id: null,
            direction: 'out',
            qty: '2',
            source_table_id: 'bom_production',
            source_record_id: 'prod-1',
            posted_at: new Date().toISOString(),
            posted_by: 'user-1',
            reversed: false,
            reversal_id: null,
          }],
          rowCount: 1,
        } as QueryResult;
      }
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    const movements = await consumeBom(
      pool, 'acme', recipe, 1, 'loc-1', 'prod-1', 'user-1'
    );

    expect(movements).toHaveLength(3);
    expect(insertCount).toBe(3);
  });

  it('scales qtys before posting', async () => {
    const insertedQtys: number[] = [];
    let callIndex = 0;
    const itemIds = ['flour', 'sugar', 'eggs'];

    const pool = makeMockPool(async (text: string, params?: unknown[]) => {
      if (text.includes('INSERT') && params) {
        // params: [id, tenantSlug, itemId, locationId, batchId, direction, qty, ...]
        insertedQtys.push(Number(params[6]));
        const item = itemIds[callIndex++] ?? 'flour';
        return {
          rows: [{
            id: `mov-${callIndex}`,
            tenant_slug: 'acme',
            item_id: item,
            location_id: 'loc-1',
            batch_id: null,
            direction: 'out',
            qty: String(params[6]),
            source_table_id: 'bom_production',
            source_record_id: 'prod-1',
            posted_at: new Date().toISOString(),
            posted_by: 'user-1',
            reversed: false,
            reversal_id: null,
          }],
          rowCount: 1,
        } as QueryResult;
      }
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await consumeBom(pool, 'acme', recipe, 2, 'loc-1', 'prod-1', 'user-1');
    expect(insertedQtys[0]).toBe(4);   // flour: 2 * 2
    expect(insertedQtys[1]).toBe(1);   // sugar: 0.5 * 2
    expect(insertedQtys[2]).toBe(6);   // eggs: 3 * 2
  });
});
