/**
 * Tests for the Wave 10 convert-to engine façade.
 * Covers: convertTo with field mapping, line copying, and linkBackField.
 */

import { Pool, QueryResult } from 'pg';
import { convertTo } from '../convert-to';
import type { ConvertToConfig } from '../convert-to';

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

const BASE_CONFIG: ConvertToConfig = {
  id: 'cfg-convert-1',
  sourceTableId: 'indent',
  targetTableId: 'purchase_order',
  headerMappings: [
    { sourceField: 'supplier_id', targetField: 'vendor_id' },
    { sourceField: 'notes', targetField: 'remarks' },
  ],
  lineMappings: [
    {
      sourceChildTable: 'indent_line',
      targetChildTable: 'po_line',
      fieldMappings: [
        { sourceField: 'item_id', targetField: 'item_id' },
        { sourceField: 'qty', targetField: 'qty_ordered' },
      ],
    },
  ],
  linkBackField: 'source_indent_id',
  respectFulfilment: false,
};

// ─── convertTo ────────────────────────────────────────────────────────────────

describe('convertTo', () => {
  it('creates a target record with mapped header fields', async () => {
    const sourceRecord = { id: 'indent-1', supplier_id: 'sup-X', notes: 'urgent' };

    const pool = makePool(async (sql, params) => {
      if (sql.includes('SELECT *') && sql.includes('indent"') && !sql.includes('_parent_id')) {
        return { rows: [sourceRecord], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('SELECT *') && sql.includes('indent_line"')) {
        return { rows: [], rowCount: 0 } as QueryResult;
      }
      if (sql.includes('INSERT INTO') && sql.includes('purchase_order"')) {
        // Verify linkBackField is in the INSERT data
        expect(String(params?.[1] ?? '') + String(sql)).toContain('source_indent_id');
        return { rows: [{ id: 'po-new-1' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ id: 'x', qty_linked: 0, created_at: new Date(), total: '0', source_line_record_id: '', source_line_table_id: '', target_line_record_id: '', target_line_table_id: '', created_by: '' }], rowCount: 1 } as QueryResult;
    });

    const result = await convertTo(pool, 'acme', BASE_CONFIG, ['indent-1'], 'user-1');
    expect(result.createdRecordId).toBe('po-new-1');
    expect(result.lines).toBe(0);
  });

  it('copies line items to target child table', async () => {
    const sourceRecord = { id: 'indent-2', supplier_id: 'sup-Y', notes: '' };
    const sourceLines = [
      { id: 'sl-1', item_id: 'item-A', qty: 10 },
      { id: 'sl-2', item_id: 'item-B', qty: 5 },
    ];

    let lineInsertCount = 0;
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT *') && sql.includes('_parent_id')) {
        return { rows: sourceLines, rowCount: 2 } as QueryResult;
      }
      if (sql.includes('SELECT *')) {
        return { rows: [sourceRecord], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO') && sql.includes('po_line"')) {
        lineInsertCount++;
        return { rows: [{ id: `po-line-${lineInsertCount}` }], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO')) {
        return { rows: [{ id: 'po-header-2' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ id: 'link', qty_linked: 1, created_at: new Date(), total: '0', source_line_record_id: '', source_line_table_id: '', target_line_record_id: '', target_line_table_id: '', created_by: '' }], rowCount: 1 } as QueryResult;
    });

    const result = await convertTo(pool, 'acme', BASE_CONFIG, ['indent-2'], 'user-1');
    expect(result.lines).toBe(2);
    expect(lineInsertCount).toBe(2);
  });

  it('sets linkBackField on the target record', async () => {
    const sourceRecord = { id: 'indent-3', supplier_id: 'sup-Z', notes: '' };
    let headerInsertSql = '';

    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT *') && sql.includes('_parent_id')) {
        return { rows: [], rowCount: 0 } as QueryResult;
      }
      if (sql.includes('SELECT *')) {
        return { rows: [sourceRecord], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO') && sql.includes('purchase_order"')) {
        headerInsertSql = sql;
        return { rows: [{ id: 'po-3' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [], rowCount: 0 } as QueryResult;
    });

    await convertTo(pool, 'acme', BASE_CONFIG, ['indent-3'], 'user-1');
    // The linkBackField 'source_indent_id' should appear in the INSERT
    expect(headerInsertSql).toContain('"source_indent_id"');
  });

  it('throws when sourceRecordIds is empty', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 } as QueryResult));
    await expect(convertTo(pool, 'acme', BASE_CONFIG, [], 'user-1')).rejects.toThrow(
      'sourceRecordIds must not be empty',
    );
  });

  it('creates fulfilment links when respectFulfilment is true', async () => {
    const config: ConvertToConfig = { ...BASE_CONFIG, respectFulfilment: true };
    const sourceRecord = { id: 'indent-4', supplier_id: 'sup-R', notes: '' };
    const sourceLines = [{ id: 'sl-R', item_id: 'item-R', qty: 10 }];

    let linkInserted = false;
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT *') && sql.includes('_parent_id')) {
        return { rows: sourceLines, rowCount: 1 } as QueryResult;
      }
      if (sql.includes('SELECT *')) {
        return { rows: [sourceRecord], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO') && sql.includes('po_line"')) {
        return { rows: [{ id: 'po-line-R' }], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO') && sql.includes('fulfilment_links')) {
        linkInserted = true;
        return { rows: [{ id: 'link-R', qty_linked: 10, created_at: new Date(), total: '0', source_line_record_id: 'sl-R', source_line_table_id: 'indent_line', target_line_record_id: 'po-line-R', target_line_table_id: 'po_line', created_by: 'user-1' }], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO')) {
        return { rows: [{ id: 'po-R' }], rowCount: 1 } as QueryResult;
      }
      return { rows: [{ total: '0' }], rowCount: 1 } as QueryResult;
    });

    const result = await convertTo(pool, 'acme', config, ['indent-4'], 'user-1');
    expect(result.lines).toBe(1);
    expect(linkInserted).toBe(true);
  });
});
