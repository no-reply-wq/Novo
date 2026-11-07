/**
 * Tests for the convert-to engine (convertRecords).
 * No DB — pool is fully stubbed.
 */

import { Pool } from 'pg';
import { convertRecords } from '@/platform/engines/convert/converter';
import type { ConvertConfig } from '@/platform/engines/convert/types';
import type { CrudContext } from '@/platform/data/crud';
import type { ExprEngine, ExprContext, ExprValue } from '@/platform/expr';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONVERT_CONFIG: ConvertConfig = {
  id: 'conv-1',
  name: 'Indent to PO',
  sourceTableId: 'indent',
  targetTableId: 'po',
  sourceLineTableId: 'indent_line',
  targetLineTableId: 'po_line',
  headerFieldMapping: [
    { sourceFieldId: 'supplier_id', targetFieldId: 'vendor_id' },
    { sourceFieldId: 'notes', targetFieldId: 'po_notes' },
  ],
  lineFieldMapping: [
    { sourceFieldId: 'item_id', targetFieldId: 'item_id' },
    { sourceFieldId: 'qty', targetFieldId: 'qty' },
  ],
  createFulfilmentLinks: false,
};

const CTX: CrudContext = {
  userId: 'user-1',
  claims: { userId: 'user-1', roles: [], locations: [] },
  now: new Date(),
};

const NOOP_EXPR: ExprEngine = {
  evaluateSource: (_expr: string, ctx: ExprContext): ExprValue =>
    (ctx.vars as Record<string, ExprValue> | undefined)?.['value'] ?? null,
} as unknown as ExprEngine;

// ─── Pool stub ────────────────────────────────────────────────────────────────

function makePool() {
  const sourceRecord = {
    id: 'indent-1',
    supplier_id: 'sup-99',
    notes: 'urgent',
  };

  const sourceLines = [
    { id: 'il-1', _parent_id: 'indent-1', item_id: 'item-A', qty: 10 },
    { id: 'il-2', _parent_id: 'indent-1', item_id: 'item-B', qty: 5 },
  ];

  let insertCount = 0;

  return {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockImplementation(async (sql: string) => {
        // Fetch source header
        if (sql.includes('WHERE id = $1') && !sql.includes('_parent_id')) {
          return { rows: [sourceRecord] };
        }
        // Fetch source lines
        if (sql.includes('_parent_id')) {
          return { rows: sourceLines };
        }
        // INSERT — alternately return header or line records
        if (sql.includes('INSERT INTO')) {
          insertCount++;
          if (insertCount === 1) {
            // header insert
            return { rows: [{ id: 'po-1', vendor_id: 'sup-99', po_notes: 'urgent', _created_by: 'user-1' }] };
          }
          // line inserts
          return {
            rows: [{ id: `po-line-${insertCount - 1}`, _parent_id: 'po-1' }],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    }),
  } as unknown as Pool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('convertRecords', () => {
  it('creates target header + lines from a single source record', async () => {
    const pool = makePool();
    const result = await convertRecords(pool, 'test', CONVERT_CONFIG, ['indent-1'], CTX, NOOP_EXPR);

    expect(result.targetRecordId).toBe('po-1');
    expect(result.targetLineRecordIds).toHaveLength(2);
    expect(result.fulfilmentLinkIds).toHaveLength(0);
  });

  it('applies header field mapping (supplier_id → vendor_id)', async () => {
    // Verify that the INSERT is called with mapped values
    const insertedParams: unknown[][] = [];
    const pool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('WHERE id = $1')) {
            return { rows: [{ id: 'indent-1', supplier_id: 'sup-99', notes: 'req' }] };
          }
          if (sql.includes('_parent_id')) return { rows: [] };
          if (sql.includes('INSERT INTO')) {
            if (params) insertedParams.push(params);
            return { rows: [{ id: 'po-new' }] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      }),
    } as unknown as Pool;

    const cfgNoLines: ConvertConfig = { ...CONVERT_CONFIG, lineFieldMapping: undefined, sourceLineTableId: undefined };
    const result = await convertRecords(pool, 'test', cfgNoLines, ['indent-1'], CTX, NOOP_EXPR);
    expect(result.targetRecordId).toBe('po-new');
    // The first INSERT carries mapped field values including 'sup-99'
    const allInsertedValues = insertedParams.flat();
    expect(allInsertedValues).toContain('sup-99');
  });

  it('result always includes a fulfilmentLinkIds array', async () => {
    const pool = makePool();
    const result = await convertRecords(pool, 'test', CONVERT_CONFIG, ['indent-1'], CTX, NOOP_EXPR);
    expect(Array.isArray(result.fulfilmentLinkIds)).toBe(true);
  });

  it('throws when sourceRecordIds is empty', async () => {
    const pool = makePool();
    await expect(
      convertRecords(pool, 'test', CONVERT_CONFIG, [], CTX, NOOP_EXPR),
    ).rejects.toThrow('sourceRecordIds must not be empty');
  });
});
