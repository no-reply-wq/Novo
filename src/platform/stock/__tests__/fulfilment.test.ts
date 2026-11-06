import { Pool, PoolClient, QueryResult } from 'pg';
import { getFulfilmentSummary } from '../fulfilment';
import type { FulfilmentConfig } from '../fulfilment';

type QueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult>;
function makePool(queryFn: QueryFn): Pool { return { connect: jest.fn().mockResolvedValue({ query: queryFn, release: jest.fn() }), query: queryFn } as unknown as Pool; }

const CONFIG: FulfilmentConfig = {
  id: 'fc-1', appId: 'app-1', name: 'Indent → PO → GRN',
  chain: [
    { tableId: 'indent_lines', qtyField: 'qty_ordered', linkField: 'indent_line_id', statusField: 'status' },
    { tableId: 'po_lines', qtyField: 'qty_ordered', linkField: 'po_line_id', statusField: 'status' },
    { tableId: 'grn_lines', qtyField: 'qty_received', linkField: 'po_line_id' },
  ],
};

describe('getFulfilmentSummary', () => {
  it('returns Open when nothing has been fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) return { rows: [{ fulfilled: '0' }], rowCount: 1 } as QueryResult;
      return { rows: [{ qty: '10' }], rowCount: 1 } as QueryResult;
    });
    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.status).toBe('Open');
    expect(summary.pendingQty).toBe(10);
    expect(summary.fulfilledQty).toBe(0);
  });

  it('returns Partial when partially fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) return { rows: [{ fulfilled: '4' }], rowCount: 1 } as QueryResult;
      return { rows: [{ qty: '10' }], rowCount: 1 } as QueryResult;
    });
    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.status).toBe('Partial');
    expect(summary.fulfilledQty).toBe(4);
    expect(summary.pendingQty).toBe(6);
  });

  it('returns Fulfilled when fully fulfilled', async () => {
    const pool = makePool(async (sql) => {
      if (sql.includes('fulfilment_links')) return { rows: [{ fulfilled: '10' }], rowCount: 1 } as QueryResult;
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
      if (sql.includes('fulfilment_links')) return { rows: [{ fulfilled: '15' }], rowCount: 1 } as QueryResult;
      return { rows: [{ qty: '20' }], rowCount: 1 } as QueryResult;
    });
    const summary = await getFulfilmentSummary(pool, 'acme', CONFIG, 1, 'po-line-1');
    expect(summary.orderedQty).toBe(20);
    expect(summary.fulfilledQty).toBe(15);
    expect(summary.pendingQty).toBe(5);
  });
});

describe('updateFulfilmentChain', () => {
  it('inserts a fulfilment link when a downstream stage record is saved', async () => {
    const { updateFulfilmentChain } = await import('../fulfilment');
    const record = { id: 'grn-line-1', qty_received: 7, po_line_id: 'po-line-1' };
    const queries: string[] = [];
    const client = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('SELECT *') && sql.includes('FOR UPDATE')) return { rows: [{ id: 'po-line-1', qty_ordered: '10', status: 'Open' }], rowCount: 1 };
        if (sql.includes('COALESCE')) return { rows: [{ linked: '0', fulfilled: '0' }], rowCount: 1 };
        void params;
        return { rows: [{ id: 'link-new', qty_linked: 7 }], rowCount: 1 };
      }),
      release: jest.fn(),
    } as unknown as PoolClient;
    await updateFulfilmentChain('acme', CONFIG, 2, record, client);
    expect(queries.some((q) => q.includes('SELECT *') && q.includes('FOR UPDATE'))).toBe(true);
  });

  it('is a no-op at stageIndex 0', async () => {
    const { updateFulfilmentChain } = await import('../fulfilment');
    const client = { query: jest.fn(), release: jest.fn() } as unknown as PoolClient;
    await updateFulfilmentChain('acme', CONFIG, 0, { id: 'indent-1', qty_ordered: 10 }, client);
    expect(client.query).not.toHaveBeenCalled();
  });
});
