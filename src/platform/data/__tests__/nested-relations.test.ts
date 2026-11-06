/**
 * Tests for nested child table fetcher and saver.
 *
 * Unit tests using in-memory mock pools — no DB required.
 * Follows the same pattern as chain.test.ts.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import {
  fetchRecordWithChildren,
  type FetchOptions,
  type RecordWithChildren,
} from '../nested-fetcher';
import {
  saveRecordWithChildren,
  type RecordWithChildrenInput,
  type SaveOptions,
} from '../nested-saver';
import type { ChildTableConfig } from '../child-tables';
import type { RlsClaims } from '../client';

// ─── Mock pool factory ────────────────────────────────────────────────────────

function makePool(queryResults: QueryResult[]): Pool {
  let callIndex = 0;

  const queryFn = async (_sql: unknown, _params?: unknown[]): Promise<QueryResult> => {
    if (typeof _sql === 'string') {
      const up = _sql.trim().toUpperCase();
      if (up === 'BEGIN' || up === 'COMMIT' || up === 'ROLLBACK') {
        return { rows: [], rowCount: 0, command: up, oid: 0, fields: [] };
      }
      // SET LOCAL / SET search_path etc.
      if (up.startsWith('SET ') || up.startsWith('SET LOCAL ')) {
        return { rows: [], rowCount: 0, command: 'SET', oid: 0, fields: [] };
      }
      // RLS context: SELECT set_config(...)
      if (up.startsWith('SELECT') && _sql.includes('set_config')) {
        return { rows: [{}], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }
    }
    const result = queryResults[callIndex++];
    if (!result) {
      throw new Error(`Unexpected query call #${callIndex} — no more canned results (sql: ${_sql})`);
    }
    return result;
  };

  const mockClient: Partial<PoolClient> = {
    query: jest.fn(queryFn) as unknown as PoolClient['query'],
    release: jest.fn(),
  };

  const mockPool: Partial<Pool> = {
    connect: jest.fn(async () => mockClient as PoolClient),
  };

  return mockPool as Pool;
}

function row<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function claims(): RlsClaims {
  return { userId: 'u1', roles: ['admin'], locations: [] };
}

function cfg(overrides: Partial<ChildTableConfig> = {}): ChildTableConfig {
  return {
    id: 'cfg-1',
    parentTableId: 'orders',
    childTableId: 'order_lines',
    parentField: 'order_id',
    depth: 0,
    displayOrder: 0,
    label: 'Order Lines',
    allowAdd: true,
    allowDelete: true,
    allowReorder: false,
    ...overrides,
  };
}

// ─── Fetch tests ──────────────────────────────────────────────────────────────

describe('fetchRecordWithChildren', () => {
  it('fetches a parent record with 2 levels of children', async () => {
    const lineConfig = cfg();
    const noteConfig = cfg({
      id: 'cfg-2',
      parentTableId: 'order_lines',
      childTableId: 'line_notes',
      parentField: 'line_id',
      depth: 1,
      label: 'Notes',
    });

    const pool = makePool([
      row([{ id: 'ord-1', name: 'Order 1' }]),                          // parent
      row([{ id: 'line-1', order_id: 'ord-1', qty: 2 }]),               // order_lines
      row([{ id: 'note-1', line_id: 'line-1', text: 'rush' }]),         // line_notes
    ]);

    const childConfigs = new Map<string, ChildTableConfig[]>([
      ['orders', [lineConfig]],
      ['order_lines', [noteConfig]],
    ]);

    const opts: FetchOptions = { pool, claims: claims(), childConfigs };
    const result = await fetchRecordWithChildren('test', 'orders', 'ord-1', opts);

    expect(result.id).toBe('ord-1');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].config.label).toBe('Order Lines');
    expect(result.children[0].rows).toHaveLength(1);
    expect(result.children[0].rows[0].id).toBe('line-1');

    const grandchildren = result.children[0].rows[0].children;
    expect(grandchildren).toHaveLength(1);
    expect(grandchildren[0].config.label).toBe('Notes');
    expect(grandchildren[0].rows[0].id).toBe('note-1');
  });

  it('respects maxDepth option — stops at depth 0', async () => {
    const lineConfig = cfg();
    const noteConfig = cfg({
      id: 'cfg-2',
      parentTableId: 'order_lines',
      childTableId: 'line_notes',
      parentField: 'line_id',
      depth: 1,
      label: 'Notes',
    });

    const pool = makePool([
      row([{ id: 'ord-1' }]),
      row([{ id: 'line-1', order_id: 'ord-1' }]),
      // No third query — depth 0 means no grandchildren fetched
    ]);

    const childConfigs = new Map<string, ChildTableConfig[]>([
      ['orders', [lineConfig]],
      ['order_lines', [noteConfig]],
    ]);

    const opts: FetchOptions = { pool, claims: claims(), childConfigs, maxDepth: 0 };
    const result = await fetchRecordWithChildren('test', 'orders', 'ord-1', opts);

    expect(result.children[0].rows[0].children).toHaveLength(0);
  });

  it('throws when parent record not found', async () => {
    const pool = makePool([row([])]);
    const childConfigs = new Map<string, ChildTableConfig[]>([['orders', []]]);
    const opts: FetchOptions = { pool, claims: claims(), childConfigs };

    await expect(
      fetchRecordWithChildren('test', 'orders', 'missing', opts),
    ).rejects.toThrow('not found');
  });

  it('handles multiple child tables on the same parent', async () => {
    const linesConfig = cfg();
    const attachConfig = cfg({
      id: 'cfg-attach',
      childTableId: 'attachments',
      parentField: 'parent_id',
      displayOrder: 1,
      label: 'Attachments',
    });

    const pool = makePool([
      row([{ id: 'ord-1' }]),
      row([{ id: 'line-1', order_id: 'ord-1' }]),
      row([{ id: 'att-1', parent_id: 'ord-1' }]),
    ]);

    const childConfigs = new Map<string, ChildTableConfig[]>([
      ['orders', [linesConfig, attachConfig]],
    ]);

    const opts: FetchOptions = { pool, claims: claims(), childConfigs };
    const result = await fetchRecordWithChildren('test', 'orders', 'ord-1', opts);

    expect(result.children).toHaveLength(2);
    expect(result.children[0].config.label).toBe('Order Lines');
    expect(result.children[1].config.label).toBe('Attachments');
  });

  it('handles self-relation (categories with subcategories)', async () => {
    const selfConfig = cfg({
      id: 'cfg-self',
      parentTableId: 'categories',
      childTableId: 'categories',
      parentField: 'parent_id',
      depth: 0,
      label: 'Subcategories',
    });

    const pool = makePool([
      row([{ id: 'cat-1', name: 'Electronics' }]),
      row([{ id: 'cat-2', parent_id: 'cat-1', name: 'Phones' }]),
      row([]),  // no deeper children for cat-2
    ]);

    const childConfigs = new Map<string, ChildTableConfig[]>([
      ['categories', [selfConfig]],
    ]);

    const opts: FetchOptions = { pool, claims: claims(), childConfigs, maxDepth: 1 };
    const result = await fetchRecordWithChildren('test', 'categories', 'cat-1', opts);

    expect(result.id).toBe('cat-1');
    expect(result.children[0].rows[0].id).toBe('cat-2');
  });
});

// ─── Save tests ───────────────────────────────────────────────────────────────

describe('saveRecordWithChildren', () => {
  it('saves parent with new child rows', async () => {
    // INSERT parent → id
    // existing lines for parent → empty
    // INSERT child → id
    // SELECT back child
    // SELECT back parent
    const pool = makePool([
      row([{ id: 'ord-new' }]),           // INSERT parent
      row([]),                             // SELECT existing order_lines (none)
      row([{ id: 'line-new' }]),          // INSERT child
      row([{ id: 'line-new', qty: 3 }]),  // SELECT back child
      row([{ id: 'ord-new', name: 'New' }]), // SELECT back parent
    ]);

    const lineConfig = cfg();
    const opts: SaveOptions = { pool, claims: claims() };
    const input: RecordWithChildrenInput = {
      data: { name: 'New Order' },
      children: [{ config: lineConfig, rows: [{ data: { qty: 3 } }] }],
    };

    const result = await saveRecordWithChildren('test', 'orders', input, opts);

    expect(result.id).toBe('ord-new');
    expect(result.children[0].rows[0].id).toBe('line-new');
  });

  it('deletes removed child rows with restrict check passing (no grandchildren)', async () => {
    const pool = makePool([
      row([]),                                             // UPDATE parent
      row([{ id: 'line-1' }, { id: 'line-2' }]),         // SELECT existing lines
      row([{ cnt: '0' }]),                                 // COUNT grandchildren of line-2
      row([]),                                             // DELETE line-2
      row([{ id: 'line-1', order_id: 'ord-1', qty: 1 }]), // SELECT back line-1 (after update)
      row([{ id: 'line-1', qty: 1 }]),                    // SELECT back child row
      row([{ id: 'ord-1', name: 'Order 1' }]),            // SELECT back parent
    ]);

    const lineConfig = cfg();
    const opts: SaveOptions = { pool, claims: claims() };
    const input: RecordWithChildrenInput = {
      id: 'ord-1',
      data: { name: 'Order 1' },
      children: [
        { config: lineConfig, rows: [{ id: 'line-1', data: { qty: 1 } }] },
      ],
    };

    const result = await saveRecordWithChildren('test', 'orders', input, opts);
    expect(result.id).toBe('ord-1');
  });

  it('restrict cascade blocks delete when children exist', async () => {
    const pool = makePool([
      // No UPDATE query — data: { status: 'x' } triggers an UPDATE
      row([]),                                   // UPDATE parent (has keys now)
      row([{ id: 'line-1' }]),                   // SELECT existing lines
      row([{ cnt: '2' }]),                        // COUNT of grandchildren — has children!
    ]);

    const lineConfig = cfg();
    const opts: SaveOptions = { pool, claims: claims() };
    const input: RecordWithChildrenInput = {
      id: 'ord-1',
      data: { status: 'active' },  // non-empty so UPDATE is issued
      children: [{ config: lineConfig, rows: [] }],
    };

    await expect(
      saveRecordWithChildren('test', 'orders', input, opts),
    ).rejects.toThrow('restrict');
  });

  it('cascade delete removes grandchildren', async () => {
    const pool = makePool([
      row([]),                              // UPDATE parent
      row([{ id: 'line-1' }]),             // SELECT existing lines
      row([]),                              // SELECT grandchildren of line-1 (none)
      row([]),                              // DELETE line-1
      row([{ id: 'ord-1' }]),              // SELECT back parent
    ]);

    const lineConfig = cfg();
    const opts: SaveOptions = { pool, claims: claims(), cascadeOnDelete: 'cascade' };
    const input: RecordWithChildrenInput = {
      id: 'ord-1',
      data: {},
      children: [{ config: lineConfig, rows: [] }],
    };

    const result = await saveRecordWithChildren('test', 'orders', input, opts);
    expect(result.id).toBe('ord-1');
  });

  it('handles multiple child tables on same parent', async () => {
    const lineConfig = cfg();
    const attachConfig = cfg({
      id: 'cfg-attach',
      childTableId: 'attachments',
      parentField: 'parent_id',
      label: 'Attachments',
    });

    const pool = makePool([
      row([{ id: 'ord-new' }]),                 // INSERT parent
      row([]),                                   // SELECT existing order_lines
      row([{ id: 'line-1' }]),                  // INSERT line
      row([{ id: 'line-1', qty: 1 }]),          // SELECT back line
      row([]),                                   // SELECT existing attachments
      row([{ id: 'att-1' }]),                   // INSERT attachment
      row([{ id: 'att-1', url: 'f.pdf' }]),     // SELECT back attachment
      row([{ id: 'ord-new' }]),                  // SELECT back parent
    ]);

    const opts: SaveOptions = { pool, claims: claims() };
    const input: RecordWithChildrenInput = {
      data: { name: 'Multi-child order' },
      children: [
        { config: lineConfig, rows: [{ data: { qty: 1 } }] },
        { config: attachConfig, rows: [{ data: { url: 'f.pdf' } }] },
      ],
    };

    const result = await saveRecordWithChildren('test', 'orders', input, opts);

    expect(result.children).toHaveLength(2);
    expect(result.children[0].rows[0].id).toBe('line-1');
    expect(result.children[1].rows[0].id).toBe('att-1');
  });
});

// ─── Type check for exported types ───────────────────────────────────────────

describe('type safety', () => {
  it('RecordWithChildren satisfies its type', () => {
    const r: RecordWithChildren = {
      id: 'x',
      tableId: 'orders',
      data: { name: 'test' },
      children: [],
    };
    expect(r.id).toBe('x');
  });
});
