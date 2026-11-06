/**
 * Tests for the Wave 10 fulfilment engine façade.
 * Covers: getFulfilmentSummary and status derivation logic.
 *
 * updateFulfilmentChain logic is covered via the PoolClient mock.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { getFulfilmentSummary } from '../fulfilment';
import type { FulfilmentConfig } from '../fulfilment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type QueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult>;

function makePool(queryFn: QueryFn): Pool {
  return {
    connect: jest.fn().mockResolvedValue({
      query: queryFn,
      release: jest.fn(),
    }),
    query: queryFn,
  } as unknown as Pool;
}

const CONFIG: FulfilmentConfig = {
  id: 'fc-1',
  appId: 'app-1',
  name: 'Indent → PO → GRN',
  chain: [
    { tableId: 'indent_lines', qtyField: 'qty_ordered', linkField: 'indent_line_id', statusField: 'status' },
    { tableId: 'po_lines',     qtyField: 'qty_ordered', linkField: 'po_line_id',     statusField: 'status' },
    { tableId: 'grn_lines',    qtyField: 'qty_received', linkField: 'po_line_id' },
  ],
};

// ─── getFulfilmentSummary ─────────────────────────────────────────────────────

describe('getFulfilmentSummary', () => {
  it('returns Open when nothing has been fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) {
        return { rows: [{ total: '0', fulfilled: '0' }], rowCount: 1 } as QueryResult;
      }
      // ordered qty from stage table
      return { rows: [{ qty: '10' }], rowCount: 1 } as QueryResult;
    });

    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.status).toBe('Open');
    expect(summary.pendingQty).toBe(10);
    expect(summary.fulfilledQty).toBe(0);
  });

  it('returns Partial when partially fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) {
        return { rows: [{ total: '4', fulfilled: '4' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ qty: '10' }], rowCount: 1 } as QueryResult;
    });

    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.status).toBe('Partial');
    expect(summary.fulfilledQty).toBe(4);
    expect(summary.pendingQty).toBe(6);
  });

  it('returns Fulfilled when fully fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) {
        return { rows: [{ total: '10', fulfilled: '10' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ qty: '10' }], rowCount: 1 } as QueryResult;
    });

    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.status).toBe('Fulfilled');
    expect(summary.pendingQty).toBe(0);
  });

  it('returns Open for an out-of-range stageIndex', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));
    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 99, 'some-id');
    expect(summary.status).toBe('Open');
  });

  it('computes pendingQty correctly', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('qty')) {
        return { rows: [{ qty: '20' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ total: '15' }], rowCount: 1 } as QueryResult;
    });

    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.orderedQty).toBe(20);
    expect(summary.fulfilledQty).toBe(15);
    expect(summary.pendingQty).toBe(5);
  });
});

// ─── updateFulfilmentChain (cascade logic) ────────────────────────────────────

describe('updateFulfilmentChain', () => {
  it('inserts a fulfilment link when a downstream stage record is saved', async () => {
    const { updateFulfilmentChain } = await import('../fulfilment');

    const record = {
      id: 'grn-line-1',
      qty_received: 7,
      po_line_id: 'po-line-1',
    };

    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        if (sql.includes('SELECT *') && sql.includes('FOR UPDATE')) {
          // Return the parent PO line
          return { rows: [{ id: 'po-line-1', qty_ordered: '10', status: 'Open' }], rowCount: 1 };
        }
        if (sql.includes('COALESCE(SUM')) {
          // Already-linked qty
          return { rows: [{ total: '0' }], rowCount: 1 };
        }
        // fulfilment_links INSERT or status UPDATE
        return { rows: [{ id: 'link-new', qty_linked: 7, created_at: new Date(), total: '0', source_line_record_id: 'po-line-1', source_line_table_id: 'po_lines', target_line_record_id: 'grn-line-1', target_line_table_id: 'grn_lines', created_by: 'system' }], rowCount: 1 };
      }),
      release: jest.fn(),
    } as unknown as PoolClient;

    // stageIndex 2 = GRN lines, so the cascade targets PO lines (stage 1)
    await updateFulfilmentChain('acme', CONFIG, 2, record, client);

    const selectQueries = queries.filter((q) => q.sql.includes('SELECT *') && q.sql.includes('FOR UPDATE'));
    expect(selectQueries.length).toBeGreaterThan(0);
  });

  it('is a no-op at stageIndex 0', async () => {
    const { updateFulfilmentChain } = await import('../fulfilment');

    const client = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as PoolClient;

    await updateFulfilmentChain('acme', CONFIG, 0, { id: 'indent-1', qty_ordered: 10 }, client);
    expect(client.query).not.toHaveBeenCalled();
  });
});
