/**
 * Tests for src/platform/data/rollup-engine.ts
 *
 * Uses a mock DB client to avoid real Postgres in unit tests.
 * Integration tests for the full SQL path are in computed.test.ts.
 */

import {
  buildRollupSubquery,
  computeRollupValue,
  type RollupOptions,
  type RelationHop,
} from '../rollup-engine';
import { NotConfiguredError } from '../errors';
import type { PoolClient } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHop(table: string, fk: string): RelationHop {
  return { childTableApiKey: table, foreignKeyColumn: fk };
}

function makeParams(
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct',
  filterExpr?: string,
  hops: RelationHop[] = [makeHop('order_lines', 'order_id')],
): RollupOptions {
  return {
    opts: {
      sourceRelationId: 'rel1',
      sourceFieldId: 'amount',
      aggregation,
      filterExpr,
    },
    relationPath: hops,
    tenantSchema: 'tenant_test',
  };
}

function makeMockClient(result: unknown): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows: [{ result: String(result) }] }),
  } as unknown as PoolClient;
}

function makeRowsClient(rows: Record<string, unknown>[]): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as PoolClient;
}

// ─── buildRollupSubquery ──────────────────────────────────────────────────────

describe('buildRollupSubquery — single hop, no filter', () => {
  it('generates a SUM subquery', () => {
    const sql = buildRollupSubquery(makeParams('sum'));
    expect(sql).not.toBeNull();
    expect(sql).toContain('SUM');
    expect(sql).toContain('"amount"');
    expect(sql).toContain('"order_lines"');
    expect(sql).toContain('"order_id"');
    expect(sql).toContain('$1::uuid');
  });

  it('generates a COUNT subquery', () => {
    const sql = buildRollupSubquery(makeParams('count'));
    expect(sql).toContain('COUNT(*)');
  });

  it('generates an AVG subquery', () => {
    const sql = buildRollupSubquery(makeParams('avg'));
    expect(sql).toContain('AVG');
  });

  it('generates MIN and MAX subqueries', () => {
    expect(buildRollupSubquery(makeParams('min'))).toContain('MIN');
    expect(buildRollupSubquery(makeParams('max'))).toContain('MAX');
  });

  it('generates COUNT DISTINCT subquery', () => {
    const sql = buildRollupSubquery(makeParams('count_distinct'));
    expect(sql).toContain('COUNT(DISTINCT');
  });

  it('filters deleted rows (deleted_at IS NULL)', () => {
    const sql = buildRollupSubquery(makeParams('sum'));
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('returns null when filterExpr is set (must use computeRollupValue)', () => {
    const sql = buildRollupSubquery(makeParams('sum', 'status = "active"'));
    expect(sql).toBeNull();
  });
});

describe('buildRollupSubquery — multi-hop', () => {
  it('generates a JOIN chain for two hops', () => {
    const hops = [
      makeHop('orders', 'customer_id'),
      makeHop('order_lines', 'order_id'),
    ];
    const sql = buildRollupSubquery(makeParams('sum', undefined, hops));
    expect(sql).not.toBeNull();
    expect(sql).toContain('"orders"');
    expect(sql).toContain('"order_lines"');
    expect(sql).toContain('JOIN');
  });
});

describe('buildRollupSubquery — empty relation path', () => {
  it('throws NotConfiguredError', () => {
    const params = makeParams('sum', undefined, []);
    expect(() => buildRollupSubquery(params)).toThrow(NotConfiguredError);
  });
});

// ─── computeRollupValue — no filter ──────────────────────────────────────────

describe('computeRollupValue — SUM without filter', () => {
  it('returns numeric result from SQL', async () => {
    const client = makeMockClient(250);
    const result = await computeRollupValue(makeParams('sum'), 'parent-uuid', client as never);
    expect(result).toBe(250);
  });

  it('returns null when DB returns null result', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ result: null }] }),
    } as unknown as PoolClient;
    const result = await computeRollupValue(makeParams('sum'), 'parent-uuid', client as never);
    expect(result).toBeNull();
  });

  it('returns null on DB error (graceful degradation)', async () => {
    const client = {
      query: jest.fn().mockRejectedValue(new Error('connection reset')),
    } as unknown as PoolClient;
    const result = await computeRollupValue(makeParams('sum'), 'parent-uuid', client as never);
    expect(result).toBeNull();
  });
});

// ─── computeRollupValue — with filter (SUM-IF) ───────────────────────────────

describe('computeRollupValue — SUM with filter expression', () => {
  it('filters rows by expression and sums matching values', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'active', deleted_at: null },
      { id: '2', amount: 200, status: 'inactive', deleted_at: null },
      { id: '3', amount: 150, status: 'active', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('sum', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBe(250); // 100 + 150
  });

  it('returns null when no rows match the filter (non-count agg)', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'inactive', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('sum', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBeNull();
  });

  it('returns 0 for COUNT when no rows match', async () => {
    const rows = [{ id: '1', amount: 100, status: 'inactive', deleted_at: null }];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('count', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBe(0);
  });

  it('returns null for invalid filterExpr (parse error)', async () => {
    const rows = [{ id: '1', amount: 100, deleted_at: null }];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('sum', '!!!invalid***'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBeNull();
  });
});

describe('computeRollupValue — AVG with filter', () => {
  it('averages matching rows', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'active', deleted_at: null },
      { id: '2', amount: 200, status: 'active', deleted_at: null },
      { id: '3', amount: 300, status: 'inactive', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('avg', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBe(150);
  });
});

describe('computeRollupValue — MIN/MAX with filter', () => {
  it('finds min of matching rows', async () => {
    const rows = [
      { id: '1', amount: 50, status: 'active', deleted_at: null },
      { id: '2', amount: 300, status: 'active', deleted_at: null },
      { id: '3', amount: 100, status: 'active', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const minResult = await computeRollupValue(
      makeParams('min', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(minResult).toBe(50);
  });

  it('finds max of matching rows', async () => {
    const rows = [
      { id: '1', amount: 50, status: 'active', deleted_at: null },
      { id: '2', amount: 300, status: 'active', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const maxResult = await computeRollupValue(
      makeParams('max', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(maxResult).toBe(300);
  });
});

describe('computeRollupValue — COUNT DISTINCT with filter', () => {
  it('counts distinct values in matching rows', async () => {
    const rows = [
      { id: '1', amount: 100, status: 'active', deleted_at: null },
      { id: '2', amount: 100, status: 'active', deleted_at: null }, // duplicate amount
      { id: '3', amount: 200, status: 'active', deleted_at: null },
    ];
    const client = makeRowsClient(rows);
    const result = await computeRollupValue(
      makeParams('count_distinct', 'status = "active"'),
      'parent-uuid',
      client as never,
    );
    expect(result).toBe(2); // 100 and 200
  });
});

describe('computeRollupValue — empty path', () => {
  it('throws NotConfiguredError', async () => {
    const client = makeMockClient(0);
    const params = makeParams('sum', undefined, []);
    await expect(computeRollupValue(params, 'p', client as never)).rejects.toThrow(
      NotConfiguredError,
    );
  });
});
