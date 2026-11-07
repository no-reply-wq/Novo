/**
 * Tests for the fulfilment engine (linkLines, getFulfilmentSummary).
 * No DB — pool is fully stubbed.
 */

import { Pool } from 'pg';
import { linkLines, getFulfilmentSummary } from '@/platform/engines/fulfilment/engine';
import { OverFulfilmentError } from '@/platform/engines/fulfilment/errors';
import type { FulfilmentConfig } from '@/platform/engines/fulfilment/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_CONFIG: FulfilmentConfig = {
  id: 'cfg-1',
  appId: 'app-1',
  name: 'Indent → PO',
  sourceTableApiKey: 'indent',
  sourceLineTableApiKey: 'indent_line',
  sourceQtyFieldApiKey: 'qty',
  targetTableApiKey: 'po',
  targetLineTableApiKey: 'po_line',
  targetQtyFieldApiKey: 'qty',
  linkFieldApiKey: 'source_line_id',
  sourceStatusFieldApiKey: 'status',
  fulfilledStatusValue: 'Fulfilled',
  partialStatusValue: 'Partial',
};

/**
 * Build a stubbed pool.
 *
 * qtyOrdered  — value returned when reading the numeric qty field from the source line
 * qtyLinked   — sum returned from fulfilment_links aggregate
 */
function makePool(qtyOrdered: number, qtyLinked: number): Pool {
  let callCount = 0;
  return {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockImplementation(async (sql: string) => {
        callCount++;
        // First call in linkLines: read ordered qty from source line
        if (sql.includes('AS val')) {
          return { rows: [{ val: String(qtyOrdered) }] };
        }
        // Second call: aggregate linked qty
        if (sql.includes('COALESCE(SUM')) {
          return { rows: [{ total: String(qtyLinked) }] };
        }
        // INSERT into fulfilment_links
        if (sql.includes('INSERT INTO public.fulfilment_links')) {
          return {
            rows: [{
              id: 'link-new',
              tenant_slug: 'test',
              source_line_table_id: 'indent_line',
              source_line_record_id: 'line-1',
              target_line_table_id: 'po_line',
              target_line_record_id: 'po-line-1',
              qty_linked: 5,
              created_at: new Date().toISOString(),
              created_by: 'user-1',
            }],
          };
        }
        // Status UPDATE
        if (sql.includes('UPDATE')) {
          return { rows: [] };
        }
        void callCount;
        return { rows: [] };
      }),
      release: jest.fn(),
    }),
  } as unknown as Pool;
}

// ─── linkLines ────────────────────────────────────────────────────────────────

describe('linkLines', () => {
  it('creates a link when qty <= pending qty', async () => {
    // ordered=10, linked=3 → pending=7; linking 5 is valid
    const pool = makePool(10, 3);
    const link = await linkLines('cfg-1', 'line-1', 'po-line-1', 5, 'user-1', 'test', pool, BASE_CONFIG);
    expect(link.sourceLineId).toBe('line-1');
    expect(link.targetLineId).toBe('po-line-1');
    expect(link.linkedQty).toBe(5);
    expect(link.configId).toBe('cfg-1');
  });

  it('throws OverFulfilmentError when qty > pending qty', async () => {
    // ordered=10, linked=8 → pending=2; trying to link 5 must fail
    const pool = makePool(10, 8);
    await expect(
      linkLines('cfg-1', 'line-1', 'po-line-1', 5, 'user-1', 'test', pool, BASE_CONFIG),
    ).rejects.toBeInstanceOf(OverFulfilmentError);
  });

  it('throws FulfilmentError when qty is 0', async () => {
    const pool = makePool(10, 0);
    await expect(
      linkLines('cfg-1', 'line-1', 'po-line-1', 0, 'user-1', 'test', pool, BASE_CONFIG),
    ).rejects.toThrow('qty must be > 0');
  });

  it('throws OverFulfilmentError when qty exactly equals ordered and already fully linked', async () => {
    // ordered=10, linked=10 → pending=0; any qty > 0 must fail
    const pool = makePool(10, 10);
    await expect(
      linkLines('cfg-1', 'line-1', 'po-line-1', 1, 'user-1', 'test', pool, BASE_CONFIG),
    ).rejects.toBeInstanceOf(OverFulfilmentError);
  });
});

// ─── getFulfilmentSummary ─────────────────────────────────────────────────────

describe('getFulfilmentSummary', () => {
  it('returns pending status when nothing linked', async () => {
    const pool = makePool(10, 0);
    const summary = await getFulfilmentSummary('cfg-1', 'line-1', pool, BASE_CONFIG, 'test');
    expect(summary.orderedQty).toBe(10);
    expect(summary.linkedQty).toBe(0);
    expect(summary.pendingQty).toBe(10);
    expect(summary.status).toBe('pending');
  });

  it('returns partial status when partially linked', async () => {
    const pool = makePool(10, 4);
    const summary = await getFulfilmentSummary('cfg-1', 'line-1', pool, BASE_CONFIG, 'test');
    expect(summary.linkedQty).toBe(4);
    expect(summary.pendingQty).toBe(6);
    expect(summary.status).toBe('partial');
  });

  it('returns fulfilled status when fully linked', async () => {
    const pool = makePool(10, 10);
    const summary = await getFulfilmentSummary('cfg-1', 'line-1', pool, BASE_CONFIG, 'test');
    expect(summary.pendingQty).toBe(0);
    expect(summary.status).toBe('fulfilled');
  });
});
