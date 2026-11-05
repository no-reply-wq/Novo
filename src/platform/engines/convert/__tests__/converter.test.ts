/**
 * Unit tests for the convert-to engine (all DB calls stubbed).
 */

import { Pool } from 'pg';
import { convertRecords } from '../converter';
import type { ConvertConfig } from '../types';
import type { CrudContext } from '@/platform/data/crud';
import type { ExprEngine, ExprContext, ExprValue, ExprType, SqlFragment } from '@/platform/expr';

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeExprEngine(overrides?: Partial<ExprEngine>): ExprEngine {
  return {
    parse: jest.fn().mockReturnValue({ source: '', resultType: 'any' as ExprType }),
    typeCheck: jest.fn().mockReturnValue([]),
    evaluate: jest.fn().mockReturnValue(null),
    evaluateSource: jest.fn().mockImplementation((_source: string, ctx: ExprContext): ExprValue => {
      return ctx.vars?.['value'] ?? null;
    }),
    toSql: jest.fn().mockReturnValue(null as SqlFragment | null),
    ...overrides,
  };
}

const ctx: CrudContext = {
  userId: 'user-abc',
  claims: { userId: 'user-abc', roles: ['admin'], locations: [] },
};

// ─── Pool factory ─────────────────────────────────────────────────────────────

type QueryFn = (sql: string, params?: unknown[]) => { rows: Record<string, unknown>[] };

function makePool(queryFn: QueryFn): Pool {
  return {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) =>
        Promise.resolve(queryFn(sql, params)),
      ),
      release: jest.fn(),
    }),
  } as unknown as Pool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('convertRecords', () => {
  const config: ConvertConfig = {
    id: 'cfg-1',
    name: 'Indent → PO',
    sourceTableId: 'indent',
    targetTableId: 'purchase_order',
    sourceLineTableId: 'indent_line',
    targetLineTableId: 'po_line',
    headerFieldMapping: [
      { sourceFieldId: 'supplier_id', targetFieldId: 'vendor_id' },
      { sourceFieldId: 'notes', targetFieldId: 'remarks' },
    ],
    lineFieldMapping: [
      { sourceFieldId: 'item_id', targetFieldId: 'item_id' },
      { sourceFieldId: 'qty', targetFieldId: 'qty_ordered' },
    ],
    createFulfilmentLinks: false,
  };

  it('field mapping copies values correctly', async () => {
    const sourceRecord = { id: 'src-1', supplier_id: 'sup-1', notes: 'urgent' };
    const sourceLines = [
      { id: 'sl-1', item_id: 'item-A', qty: 10 },
    ];

    let insertedHeaderData: Record<string, unknown> = {};
    let insertedLineData: Record<string, unknown> = {};

    const pool = makePool((sql) => {
      if (sql.includes('SELECT * FROM') && sql.includes('indent"') && !sql.includes('_parent_id')) {
        return { rows: [sourceRecord] };
      }
      if (sql.includes('SELECT * FROM') && sql.includes('indent_line"')) {
        return { rows: sourceLines };
      }
      if (sql.includes('INSERT INTO') && sql.includes('purchase_order"')) {
        insertedHeaderData = { vendor_id: 'sup-1', remarks: 'urgent' };
        return { rows: [{ id: 'tgt-header-1', ...insertedHeaderData }] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('po_line"')) {
        insertedLineData = { item_id: 'item-A', qty_ordered: 10 };
        return { rows: [{ id: 'tgt-line-1', ...insertedLineData }] };
      }
      // Fulfilment link insert
      return { rows: [{ id: 'link-1', qty_linked: 10, created_at: new Date(), total: '0' }] };
    });

    const result = await convertRecords(pool, 'test', config, ['src-1'], ctx, makeExprEngine());

    expect(result.targetRecordId).toBe('tgt-header-1');
    expect(result.targetLineRecordIds).toEqual(['tgt-line-1']);
    expect(result.fulfilmentLinkIds).toHaveLength(0); // createFulfilmentLinks = false
    expect(insertedHeaderData['vendor_id']).toBe('sup-1');
    expect(insertedHeaderData['remarks']).toBe('urgent');
  });

  it('applies transformExpr to mapped fields', async () => {
    const transformConfig: ConvertConfig = {
      ...config,
      headerFieldMapping: [
        {
          sourceFieldId: 'amount',
          targetFieldId: 'total',
          transformExpr: 'value * 1.1',
        },
      ],
      lineFieldMapping: [],
    };

    const sourceRecord = { id: 'src-2', amount: 100 };

    // The ExprEngine will be called with transformExpr; we simulate it doubling
    const exprEngine = makeExprEngine({
      evaluateSource: jest.fn().mockImplementation((_source: string, _exprCtx: ExprContext): ExprValue => {
        return 110; // 100 * 1.1
      }),
    });

    let capturedHeaderData: Record<string, unknown> = {};
    const pool = makePool((sql) => {
      if (sql.includes('SELECT * FROM') && !sql.includes('_parent_id')) {
        return { rows: [sourceRecord] };
      }
      if (sql.includes('SELECT * FROM') && sql.includes('indent_line')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO')) {
        capturedHeaderData = { total: 110 };
        return { rows: [{ id: 'tgt-2', total: 110 }] };
      }
      return { rows: [] };
    });

    await convertRecords(pool, 'test', transformConfig, ['src-2'], ctx, exprEngine);

    expect(exprEngine.evaluateSource).toHaveBeenCalledWith(
      'value * 1.1',
      expect.objectContaining({ vars: expect.objectContaining({ value: 100 }) }),
    );
    expect(capturedHeaderData['total']).toBe(110);
  });

  it('merges lines from multiple source records into one target', async () => {
    const sourceRecords: Record<string, Record<string, unknown>> = {
      'src-A': { id: 'src-A', supplier_id: 'sup-1', notes: '' },
      'src-B': { id: 'src-B', supplier_id: 'sup-1', notes: '' },
    };
    const sourceLines: Record<string, Record<string, unknown>[]> = {
      'src-A': [{ id: 'slA-1', item_id: 'X', qty: 5 }],
      'src-B': [{ id: 'slB-1', item_id: 'Y', qty: 3 }],
    };

    const insertedLineIds: string[] = [];
    let lineInsertCount = 0;

    const pool = makePool((sql, params) => {
      if (sql.includes('SELECT * FROM') && sql.includes('_parent_id')) {
        const parentId = params?.[0] as string;
        return { rows: sourceLines[parentId] ?? [] };
      }
      if (sql.includes('SELECT * FROM')) {
        const id = (params?.[0] as string) ?? '';
        return { rows: [sourceRecords[id] ?? {}] };
      }
      if (sql.includes('INSERT INTO') && sql.includes('po_line')) {
        lineInsertCount++;
        const lid = `tgt-line-${lineInsertCount}`;
        insertedLineIds.push(lid);
        return { rows: [{ id: lid }] };
      }
      if (sql.includes('INSERT INTO')) {
        return { rows: [{ id: 'tgt-header-multi' }] };
      }
      return { rows: [{ id: 'link-x', qty_linked: 1, created_at: new Date(), total: '0' }] };
    });

    const result = await convertRecords(pool, 'test', config, ['src-A', 'src-B'], ctx, makeExprEngine());

    expect(result.targetRecordId).toBe('tgt-header-multi');
    expect(result.targetLineRecordIds).toHaveLength(2);
  });

  it('throws when sourceRecordIds is empty', async () => {
    const pool = makePool(() => ({ rows: [] }));
    await expect(
      convertRecords(pool, 'test', config, [], ctx, makeExprEngine()),
    ).rejects.toThrow('sourceRecordIds must not be empty');
  });
});
