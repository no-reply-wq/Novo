/**
 * Stock engine — Wave 10 public API.
 *
 * Thin façade over src/platform/engines/stock/ that exposes the types
 * declared in ./types.ts and adds the getStockReport and fifoBatches helpers.
 */

import { Pool, PoolClient } from 'pg';
import {
  postMovement,
  getAvailableStock,
  StockMovement as LedgerMovement,
} from '@/platform/engines/stock/ledger';
import { drawDown } from '@/platform/engines/stock/availability';
import { InsufficientStockError } from '@/platform/engines/stock/errors';
import type {
  StockConfig,
  StockMovement,
  StockBalance,
  FifoAllocation,
} from './types';

export { InsufficientStockError };

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveDirection(
  config: StockConfig,
  record: Record<string, unknown>,
): 'in' | 'out' {
  if (config.direction === 'in' || config.direction === 'out') {
    return config.direction;
  }
  // Simple expression: check if the record field value matches a pattern.
  // The full platform expression engine would be wired here in production.
  const expr = config.directionExpr ?? '';
  if (expr.trim() === 'in') return 'in';
  if (expr.trim() === 'out') return 'out';
  void record;
  return expr.includes('out') ? 'out' : 'in';
}

function ledgerToPublic(m: LedgerMovement): StockMovement {
  return {
    id: m.id,
    tenantSlug: m.tenantSlug,
    itemId: m.itemId,
    locationId: m.locationId,
    batchNo: m.batchId,
    direction: m.direction,
    qty: m.qty,
    sourceTableId: m.sourceTableId,
    sourceRecordId: m.sourceRecordId,
    postedAt: m.postedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Post a stock movement (called on record save when triggerStatus matches).
 * Runs inside an existing transaction client and checks available stock for
 * 'out' movements before posting.
 */
export async function postStockMovement(
  tenantSlug: string,
  config: StockConfig,
  record: Record<string, unknown>,
  client: PoolClient,
): Promise<StockMovement> {
  // Check trigger status
  if (config.triggerStatus !== undefined) {
    const statusVal = record['status'] ?? record['Status'];
    if (statusVal !== config.triggerStatus) {
      throw new Error(
        `Stock trigger not met: expected status "${config.triggerStatus}", got "${String(statusVal)}"`,
      );
    }
  }

  const itemId = record[config.itemField];
  const locationId = record[config.locationField];
  const qty = record[config.qtyField];

  if (typeof itemId !== 'string' || typeof locationId !== 'string' || typeof qty !== 'number') {
    throw new Error(
      `postStockMovement: itemId and locationId must be strings, qty must be number. ` +
        `Got itemId=${typeof itemId} locationId=${typeof locationId} qty=${typeof qty}`,
    );
  }

  const direction = resolveDirection(config, record);
  const batchId = config.batchField ? (record[config.batchField] as string | undefined) : undefined;

  // For 'out' movements: check availability using FOR UPDATE in the same transaction
  if (direction === 'out') {
    const balanceResult = await client.query<{ balance: string }>(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END), 0) AS balance
       FROM public.stock_movements
       WHERE reversed = false
         AND tenant_slug = $1
         AND item_id = $2
         AND location_id = $3
         AND (batch_id = $4 OR ($4::text IS NULL AND batch_id IS NULL))
       FOR UPDATE`,
      [tenantSlug, itemId, locationId, batchId ?? null],
    );
    const available = Number(balanceResult.rows[0]?.balance ?? 0);
    if (available < qty) {
      throw new InsufficientStockError(itemId, locationId, qty, available, batchId);
    }
  }

  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO public.stock_movements
      (id, tenant_slug, item_id, location_id, batch_id, direction, qty,
       source_table_id, source_record_id, posted_by, reversed)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, false)
     RETURNING *`,
    [
      tenantSlug,
      itemId,
      locationId,
      batchId ?? null,
      direction,
      qty,
      config.tableId,
      String(record['id'] ?? ''),
      'system',
    ],
  );

  const row = result.rows[0];
  return {
    id: String(row['id']),
    tenantSlug,
    itemId,
    locationId,
    batchNo: batchId,
    direction,
    qty,
    sourceTableId: config.tableId,
    sourceRecordId: String(record['id'] ?? ''),
    postedAt: new Date(String(row['posted_at'])),
  };
}

/**
 * Reverse a previous stock movement (called on record cancel/delete).
 * Marks the original as reversed and inserts a mirror movement.
 */
export async function reverseStockMovement(
  tenantSlug: string,
  sourceTableId: string,
  sourceRecordId: string,
  client: PoolClient,
): Promise<void> {
  const orig = await client.query<Record<string, unknown>>(
    `SELECT * FROM public.stock_movements
     WHERE tenant_slug = $1
       AND source_table_id = $2
       AND source_record_id = $3
       AND reversed = false
     FOR UPDATE`,
    [tenantSlug, sourceTableId, sourceRecordId],
  );

  for (const row of orig.rows) {
    const originalId = String(row['id']);
    const mirrorDir: 'in' | 'out' = row['direction'] === 'in' ? 'out' : 'in';

    await client.query(
      `INSERT INTO public.stock_movements
        (id, tenant_slug, item_id, location_id, batch_id, direction, qty,
         source_table_id, source_record_id, posted_by, reversed, reversal_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)`,
      [
        tenantSlug,
        row['item_id'],
        row['location_id'],
        row['batch_id'] ?? null,
        mirrorDir,
        row['qty'],
        sourceTableId,
        sourceRecordId,
        'system',
        originalId,
      ],
    );

    await client.query(
      `UPDATE public.stock_movements SET reversed = true WHERE id = $1`,
      [originalId],
    );
  }
}

/**
 * Get current stock balance for an item + location, optionally scoped to a batch.
 */
export async function getStockBalance(
  pool: Pool,
  tenantSlug: string,
  itemId: string,
  locationId: string,
  batchNo?: string,
): Promise<StockBalance> {
  const available = await getAvailableStock(pool, tenantSlug, itemId, locationId, batchNo);
  return {
    itemId,
    locationId,
    batchNo,
    availableQty: available,
    reservedQty: 0,
    onOrderQty: 0,
  };
}

/**
 * Get stock balances for all items (optionally filtered).
 */
export async function getStockReport(
  pool: Pool,
  tenantSlug: string,
  filters?: { locationId?: string; itemId?: string; belowReorderLevel?: boolean },
): Promise<StockBalance[]> {
  const params: unknown[] = [tenantSlug];
  const clauses: string[] = ['tenant_slug = $1', 'reversed = false'];

  if (filters?.locationId) {
    params.push(filters.locationId);
    clauses.push(`location_id = $${params.length}`);
  }
  if (filters?.itemId) {
    params.push(filters.itemId);
    clauses.push(`item_id = $${params.length}`);
  }

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
       item_id, location_id, batch_id,
       SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END) AS balance
     FROM public.stock_movements
     WHERE ${clauses.join(' AND ')}
     GROUP BY item_id, location_id, batch_id
     HAVING SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END) > 0
     ORDER BY item_id, location_id, batch_id`,
    params,
  );

  return result.rows.map((row) => ({
    itemId: String(row['item_id']),
    locationId: String(row['location_id']),
    batchNo: row['batch_id'] ? String(row['batch_id']) : undefined,
    availableQty: Number(row['balance']),
    reservedQty: 0,
    onOrderQty: 0,
  }));
}

/**
 * FIFO draw-down: for an 'out' movement, pick batches in FIFO order.
 * Returns the allocations but does NOT post movements — caller decides.
 */
export async function fifoBatches(
  pool: Pool,
  tenantSlug: string,
  itemId: string,
  locationId: string,
  requiredQty: number,
): Promise<FifoAllocation[]> {
  const result = await drawDown(
    pool,
    tenantSlug,
    itemId,
    locationId,
    requiredQty,
    'FIFO',
  );

  return result.allocations.map((a) => ({
    batchNo: a.batchId ?? '',
    qty: a.qty,
    costPerUnit: 0, // cost not stored in ledger; callers supply separately
  }));
}

// Re-export the ledger functions for direct use where needed
export { postMovement, getAvailableStock };
export type { LedgerMovement };
