/**
 * Stock engine tests — Wave 2 Agent H.
 * Requires TEST_DATABASE_URL with a live Postgres connection.
 * Run with: TEST_DATABASE_URL=... npx jest src/__tests__/engines/stock.test.ts
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  postStockMovement,
  reverseStockMovement,
  getStockBalance,
  checkAvailability,
} from '@/platform/engines/stock/engine';
import { InsufficientStockError } from '@/platform/engines/stock/errors';
import type { StockMovementConfig } from '@/platform/engines/stock/types';

const TEST_DB = process.env.TEST_DATABASE_URL;

// Skip all tests gracefully when no DB is configured
const describeOrSkip = TEST_DB ? describe : describe.skip;

describeOrSkip('Stock Engine (integration)', () => {
  let pool: Pool;
  let appId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    // Ensure the ledger table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform.stock_ledger (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        tenant_slug TEXT NOT NULL,
        table_api_key TEXT NOT NULL,
        record_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        qty NUMERIC(18,4) NOT NULL,
        direction TEXT NOT NULL,
        batch_no TEXT,
        lot_no TEXT,
        expiry_date DATE,
        posted_at TIMESTAMPTZ DEFAULT now(),
        posted_by TEXT,
        reversed_at TIMESTAMPTZ,
        reversed_by TEXT
      )
    `);
    appId = randomUUID();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM platform.stock_ledger WHERE app_id = $1', [appId]);
    await pool.end();
  });

  function makeConfig(overrides: Partial<StockMovementConfig> = {}): StockMovementConfig {
    return {
      id: randomUUID(),
      appId,
      tableApiKey: 'receipts',
      itemFieldApiKey: 'itemId',
      locationFieldApiKey: 'locationId',
      qtyFieldApiKey: 'qty',
      direction: 'in',
      ...overrides,
    };
  }

  const itemId = 'item-001';
  const locationId = 'loc-001';

  it('posts an IN movement and returns a positive balance', async () => {
    const config = makeConfig({ direction: 'in' });
    const record = { id: randomUUID(), itemId, locationId, qty: 100 };
    const { ledgerId, newBalance } = await postStockMovement(config, record, 'user1', 'tenant1', pool);
    expect(typeof ledgerId).toBe('string');
    expect(newBalance).toBeGreaterThanOrEqual(100);
  });

  it('posts an OUT movement and reduces the balance', async () => {
    // First ensure there is enough stock
    const inConfig = makeConfig({ direction: 'in' });
    const inRecord = { id: randomUUID(), itemId, locationId, qty: 200 };
    await postStockMovement(inConfig, inRecord, 'user1', 'tenant1', pool);

    const balBefore = await getStockBalance(appId, itemId, locationId, pool);

    const outConfig = makeConfig({ direction: 'out' });
    const outRecord = { id: randomUUID(), itemId, locationId, qty: 50 };
    const { newBalance } = await postStockMovement(outConfig, outRecord, 'user1', 'tenant1', pool);
    expect(newBalance).toBe(balBefore - 50);
  });

  it('throws InsufficientStockError when stock is not enough', async () => {
    const balance = await getStockBalance(appId, itemId, locationId, pool);
    const outConfig = makeConfig({ direction: 'out' });
    const record = { id: randomUUID(), itemId, locationId: 'loc-empty', qty: 9999 };
    await expect(
      postStockMovement(outConfig, record, 'user1', 'tenant1', pool),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    void balance;
  });

  it('reverses a movement and restores balance', async () => {
    // Post IN of 50
    const config = makeConfig({ direction: 'in' });
    const record = { id: randomUUID(), itemId: 'item-rev', locationId: 'loc-rev', qty: 50 };
    const { ledgerId } = await postStockMovement(config, record, 'user1', 'tenant1', pool);
    const balAfterPost = await getStockBalance(appId, 'item-rev', 'loc-rev', pool);
    expect(balAfterPost).toBe(50);

    // Reverse it
    await reverseStockMovement(ledgerId, 'user1', pool);
    const balAfterReversal = await getStockBalance(appId, 'item-rev', 'loc-rev', pool);
    expect(balAfterReversal).toBe(0);
  });

  it('FIFO draw-down: draws from the first batch first', async () => {
    const fifoItemId = 'item-fifo';
    const fifoLocId = 'loc-fifo';
    // Post batch A: 30 units
    const batchA = randomUUID();
    const inA = makeConfig({ direction: 'in', batchFieldApiKey: 'batchNo' });
    await postStockMovement(inA, { id: randomUUID(), itemId: fifoItemId, locationId: fifoLocId, qty: 30, batchNo: batchA }, 'u', 'tenant1', pool);
    // Post batch B: 40 units
    const batchB = randomUUID();
    await postStockMovement(inA, { id: randomUUID(), itemId: fifoItemId, locationId: fifoLocId, qty: 40, batchNo: batchB }, 'u', 'tenant1', pool);

    const bal = await getStockBalance(appId, fifoItemId, fifoLocId, pool);
    expect(bal).toBe(70);

    // Check availability is true for 60
    const { available } = await checkAvailability(appId, fifoItemId, fifoLocId, 60, pool);
    expect(available).toBe(true);

    // Check availability is false for 71
    const { available: notAvail } = await checkAvailability(appId, fifoItemId, fifoLocId, 71, pool);
    expect(notAvail).toBe(false);
  });
});
