/**
 * BOM engine tests — Wave 2 Agent H.
 * Pure-unit tests for scaleBom; DB-integration tests for checkBomShortages.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { scaleBom, checkBomShortages, autoFillConsumptionLines } from '@/platform/engines/bom/engine';
import type { Bom } from '@/platform/engines/bom/engine';

function makeBom(overrides: Partial<Bom> = {}): Bom {
  return {
    id: randomUUID(),
    appId: randomUUID(),
    productId: 'product-001',
    version: '1.0',
    lines: [
      { itemId: 'comp-A', qtyPer: 2, unit: 'kg' },
      { itemId: 'comp-B', qtyPer: 0.5, unit: 'L' },
    ],
    ...overrides,
  };
}

describe('BOM Engine — scaleBom (unit)', () => {
  it('scales 1 unit correctly (identity)', () => {
    const bom = makeBom();
    const scaled = scaleBom(bom, 1);
    expect(scaled[0].scaledQty).toBe(2);
    expect(scaled[1].scaledQty).toBe(0.5);
  });

  it('scales 10 units → 50 units correctly', () => {
    const bom = makeBom({
      lines: [
        { itemId: 'comp-A', qtyPer: 3, unit: 'kg' },
        { itemId: 'comp-B', qtyPer: 1.5, unit: 'L' },
      ],
    });
    // base qty is 1 unit, scale to 50
    const scaled = scaleBom(bom, 50);
    expect(scaled[0].scaledQty).toBe(150); // 3 * 50
    expect(scaled[1].scaledQty).toBe(75);  // 1.5 * 50
  });

  it('throws for zero or negative targetQty', () => {
    const bom = makeBom();
    expect(() => scaleBom(bom, 0)).toThrow('targetQty must be positive');
    expect(() => scaleBom(bom, -5)).toThrow('targetQty must be positive');
  });

  it('preserves unit on scaled lines', () => {
    const bom = makeBom();
    const scaled = scaleBom(bom, 3);
    expect(scaled[0].unit).toBe('kg');
    expect(scaled[1].unit).toBe('L');
  });
});

describe('BOM Engine — autoFillConsumptionLines (unit)', () => {
  it('returns correct qty and unit for each component', async () => {
    const bom = makeBom();
    const lines = await autoFillConsumptionLines(bom, 10, 'loc-001');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ itemId: 'comp-A', qty: 20, unit: 'kg' });
    expect(lines[1]).toEqual({ itemId: 'comp-B', qty: 5, unit: 'L' });
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeOrSkip = TEST_DB ? describe : describe.skip;

describeOrSkip('BOM Engine — checkBomShortages (integration)', () => {
  let pool: Pool;
  let appId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
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
    // Seed: comp-A has 100 units, comp-B has 3 units
    await pool.query(
      `INSERT INTO platform.stock_ledger (id,app_id,tenant_slug,table_api_key,record_id,item_id,location_id,qty,direction)
       VALUES ($1,$2,'t','tbl',$3,'comp-X','loc-bom',100,'in'),
              ($4,$5,'t','tbl',$6,'comp-Y','loc-bom',3,'in')`,
      [randomUUID(), appId, randomUUID(), randomUUID(), appId, randomUUID()],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM platform.stock_ledger WHERE app_id=$1', [appId]);
    await pool.end();
  });

  it('reports no shortages when stock is sufficient', async () => {
    const bom: Bom = {
      id: randomUUID(), appId, productId: 'p', version: '1',
      lines: [
        { itemId: 'comp-X', qtyPer: 10, unit: 'kg' },
        { itemId: 'comp-Y', qtyPer: 1, unit: 'L' },
      ],
    };
    // targetQty=1 → needs 10 comp-X, 1 comp-Y → both available
    const shortages = await checkBomShortages(bom, 1, 'loc-bom', appId, pool);
    expect(shortages).toHaveLength(0);
  });

  it('reports shortages for components with insufficient stock', async () => {
    const bom: Bom = {
      id: randomUUID(), appId, productId: 'p', version: '1',
      lines: [
        { itemId: 'comp-X', qtyPer: 200, unit: 'kg' }, // needs 200, only 100 available
        { itemId: 'comp-Y', qtyPer: 1, unit: 'L' },   // needs 1, 3 available → ok
      ],
    };
    const shortages = await checkBomShortages(bom, 1, 'loc-bom', appId, pool);
    expect(shortages).toHaveLength(1);
    expect(shortages[0].itemId).toBe('comp-X');
    expect(shortages[0].shortage).toBe(100);
  });
});
