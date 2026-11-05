/**
 * Tests for the rollup engine using a mock DB client.
 */

import { computeRollup } from '../rollup';
import type { RollupField } from '../types';
import type { PoolClient } from 'pg';

// ─── Mock DB client ───────────────────────────────────────────────────────────

function makeMockClient(rows: Record<string, unknown>[]): PoolClient {
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      // If the query is an aggregation query (no filter), return pre-aggregated result
      if (/SELECT.*AS result/.test(sql)) {
        const nums = rows
          .filter(r => r['deleted_at'] == null)
          .map(r => r['amount'] as number)
          .filter(v => typeof v === 'number');

        const sum = nums.reduce((a, b) => a + b, 0);
        return Promise.resolve({ rows: [{ result: String(sum) }] });
      }
      // Otherwise return raw rows
      return Promise.resolve({ rows });
    }),
  } as unknown as PoolClient;
}

function makeRollupField(
  aggregation: RollupField['options']['aggregation'],
  filterExpr?: string,
): RollupField {
  return {
    id: 'fld1',
    tableId: 'tbl1',
    name: 'Total Amount',
    apiKey: 'total_amount',
    type: 'rollup',
    options: {
      sourceRelationId: 'rel1',
      sourceFieldId: 'amount',
      aggregation,
      filterExpr,
    },
    rank: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeRollup - SUM without filter', () => {
  it('sums child rows via SQL', async () => {
    const client = makeMockClient([]);
    const field = makeRollupField('sum');
    const result = await computeRollup(field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id');
    expect(result).toBe(0); // mock returns sum=0 from empty array
  });

  it('returns null on DB error', async () => {
    const client = {
      query: jest.fn().mockRejectedValue(new Error('DB error')),
    } as unknown as PoolClient;
    const field = makeRollupField('sum');
    const result = await computeRollup(field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id');
    expect(result).toBeNull();
  });
});

describe('computeRollup - SUM with filter expression', () => {
  it('filters rows and sums matching ones', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'active', deleted_at: null },
      { id: '2', amount: 200, status: 'inactive', deleted_at: null },
      { id: '3', amount: 150, status: 'active', deleted_at: null },
    ];

    const client = {
      query: jest.fn().mockResolvedValue({ rows }),
    } as unknown as PoolClient;

    // The expr engine uses double-quoted string literals
    const field = makeRollupField('sum', 'status = "active"');
    const result = await computeRollup(
      field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id',
    );
    expect(result).toBe(250); // 100 + 150
  });

  it('returns null when no rows match the filter', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'inactive', deleted_at: null },
    ];

    const client = {
      query: jest.fn().mockResolvedValue({ rows }),
    } as unknown as PoolClient;

    const field = makeRollupField('sum', 'status = "active"');
    const result = await computeRollup(
      field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id',
    );
    expect(result).toBeNull();
  });
});

describe('computeRollup - COUNT with filter', () => {
  it('counts all rows when no filter', async () => {
    const rows = [
      { id: '1', amount: 100, deleted_at: null },
      { id: '2', amount: 200, deleted_at: null },
    ];

    const client = {
      query: jest.fn().mockResolvedValue({ rows }),
    } as unknown as PoolClient;

    const field = makeRollupField('count', '1 = 1');
    const result = await computeRollup(
      field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id',
    );
    expect(result).toBe(2);
  });
});

describe('computeRollup - AVG with filter', () => {
  it('averages matching rows', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'active', deleted_at: null },
      { id: '2', amount: 200, status: 'active', deleted_at: null },
    ];

    const client = {
      query: jest.fn().mockResolvedValue({ rows }),
    } as unknown as PoolClient;

    const field = makeRollupField('avg', 'status = "active"');
    const result = await computeRollup(
      field, 'parent-uuid', client, 'tenant_test', 'order_lines', 'order_id',
    );
    expect(result).toBe(150);
  });
});

describe('computeRollup - MIN/MAX with filter', () => {
  it('finds min of matching rows', async () => {
    const rows = [
      { id: '1', amount: 50, status: 'active', deleted_at: null },
      { id: '2', amount: 300, status: 'active', deleted_at: null },
      { id: '3', amount: 100, status: 'active', deleted_at: null },
    ];

    const client = {
      query: jest.fn().mockResolvedValue({ rows }),
    } as unknown as PoolClient;

    const minField = makeRollupField('min', 'status = "active"');
    expect(await computeRollup(minField, 'p', client, 'tenant_test', 'tbl', 'fk')).toBe(50);

    const maxField = makeRollupField('max', 'status = "active"');
    expect(await computeRollup(maxField, 'p', client, 'tenant_test', 'tbl', 'fk')).toBe(300);
  });
});
