/**
 * Integration tests for the stock ledger.
 * Requires TEST_DATABASE_URL env var — skipped otherwise.
 *
 * Run with: npm run test:integration
 */

import { Pool } from 'pg';
import { postMovement, getAvailableStock, reverseMovement } from '../ledger';
import { drawDown } from '../availability';
import { MovementAlreadyReversedError } from '../errors';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

let pool: Pool;

beforeAll(async () => {
  if (!TEST_DB_URL) return;
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Create the stock_movements table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.stock_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_slug TEXT NOT NULL,
      item_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      batch_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      qty NUMERIC NOT NULL CHECK (qty > 0),
      source_table_id TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      posted_by TEXT NOT NULL,
      reversed BOOLEAN NOT NULL DEFAULT false,
      reversal_id UUID REFERENCES public.stock_movements(id)
    )
  `);
});

afterAll(async () => {
  if (pool) await pool.end();
});

// Clean test tenant rows between tests
beforeEach(async () => {
  if (!TEST_DB_URL) return;
  await pool.query(`DELETE FROM public.stock_movements WHERE tenant_slug = 'test-tenant'`);
});

describeIfDb('ledger integration', () => {
  it('post in, post out, balance = qty_in - qty_out', async () => {
    await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-1',
      locationId: 'loc-int-1',
      direction: 'in',
      qty: 100,
      sourceTableId: 'grn',
      sourceRecordId: 'grn-1',
      postedBy: 'tester',
    });

    await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-1',
      locationId: 'loc-int-1',
      direction: 'out',
      qty: 30,
      sourceTableId: 'dispatch',
      sourceRecordId: 'disp-1',
      postedBy: 'tester',
    });

    const balance = await getAvailableStock(pool, 'test-tenant', 'item-int-1', 'loc-int-1');
    expect(balance).toBe(70);
  });

  it('reverse a movement — balance restored', async () => {
    const inMovement = await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-2',
      locationId: 'loc-int-2',
      direction: 'in',
      qty: 50,
      sourceTableId: 'grn',
      sourceRecordId: 'grn-2',
      postedBy: 'tester',
    });

    const outMovement = await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-2',
      locationId: 'loc-int-2',
      direction: 'out',
      qty: 20,
      sourceTableId: 'dispatch',
      sourceRecordId: 'disp-2',
      postedBy: 'tester',
    });

    // Balance is 50 - 20 = 30
    let balance = await getAvailableStock(pool, 'test-tenant', 'item-int-2', 'loc-int-2');
    expect(balance).toBe(30);

    // Reverse the out movement — should restore 20
    await reverseMovement(pool, 'test-tenant', outMovement.id, 'tester');

    balance = await getAvailableStock(pool, 'test-tenant', 'item-int-2', 'loc-int-2');
    expect(balance).toBe(50);

    void inMovement; // silence unused warning
  });

  it('cannot reverse a movement twice', async () => {
    const movement = await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-3',
      locationId: 'loc-int-3',
      direction: 'in',
      qty: 10,
      sourceTableId: 'grn',
      sourceRecordId: 'grn-3',
      postedBy: 'tester',
    });

    await reverseMovement(pool, 'test-tenant', movement.id, 'tester');

    await expect(
      reverseMovement(pool, 'test-tenant', movement.id, 'tester'),
    ).rejects.toThrow(MovementAlreadyReversedError);
  });

  it('FIFO draw-down across multiple batches', async () => {
    // Post two batches at different times
    await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-4',
      locationId: 'loc-int-4',
      batchId: 'batch-older',
      direction: 'in',
      qty: 8,
      sourceTableId: 'grn',
      sourceRecordId: 'grn-4a',
      postedBy: 'tester',
    });

    await postMovement(pool, 'test-tenant', {
      tenantSlug: 'test-tenant',
      itemId: 'item-int-4',
      locationId: 'loc-int-4',
      batchId: 'batch-newer',
      direction: 'in',
      qty: 10,
      sourceTableId: 'grn',
      sourceRecordId: 'grn-4b',
      postedBy: 'tester',
    });

    // Draw down 12 — should consume all of batch-older (8) + 4 from batch-newer
    const { allocations } = await drawDown(
      pool, 'test-tenant', 'item-int-4', 'loc-int-4', 12, 'FIFO'
    );

    expect(allocations).toHaveLength(2);
    expect(allocations[0].qty).toBe(8);
    expect(allocations[1].qty).toBe(4);

    const balance = await getAvailableStock(pool, 'test-tenant', 'item-int-4', 'loc-int-4');
    expect(balance).toBe(6); // 18 - 12 = 6
  });
});
