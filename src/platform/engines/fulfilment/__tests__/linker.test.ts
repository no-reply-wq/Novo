/**
 * Unit tests for fulfilment linker (pure logic, no DB).
 *
 * We test the status-derivation logic by stubbing the pool so SQL never runs.
 */

import { Pool } from 'pg';
import { getFulfilmentStatus } from '../linker';

// ─── Pool stub ────────────────────────────────────────────────────────────────

function makePool(qtyLinkedTotal: number): Pool {
  return {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({
        rows: [{ total: String(qtyLinkedTotal) }],
      }),
      release: jest.fn(),
    }),
  } as unknown as Pool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getFulfilmentStatus', () => {
  const tenantSlug = 'test-tenant';
  const sourceLineTableId = 'indent_line';
  const sourceLineRecordId = 'line-001';

  it('returns correct qty_pending when partially linked', async () => {
    const pool = makePool(3);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 10);
    expect(status.qtyOrdered).toBe(10);
    expect(status.qtyLinked).toBe(3);
    expect(status.qtyPending).toBe(7);
  });

  it('status = partial when qtyLinked < qtyOrdered', async () => {
    const pool = makePool(5);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 10);
    expect(status.status).toBe('partial');
  });

  it('status = fulfilled when qtyLinked === qtyOrdered', async () => {
    const pool = makePool(10);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 10);
    expect(status.status).toBe('fulfilled');
  });

  it('status = over when qtyLinked > qtyOrdered', async () => {
    const pool = makePool(12);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 10);
    expect(status.status).toBe('over');
  });

  it('status = open when qtyLinked === 0', async () => {
    const pool = makePool(0);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 5);
    expect(status.status).toBe('open');
    expect(status.qtyPending).toBe(5);
  });

  it('qtyPending is clamped to 0 when over-fulfilled', async () => {
    const pool = makePool(15);
    const status = await getFulfilmentStatus(pool, tenantSlug, sourceLineTableId, sourceLineRecordId, 10);
    expect(status.qtyPending).toBe(0);
  });
});
