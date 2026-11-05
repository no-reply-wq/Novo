/**
 * Stock availability checks and FIFO/FEFO draw-down.
 */

import { Pool } from 'pg';
import { InsufficientStockError } from './errors';
import { getAvailableStock, postMovement, StockMovement } from './ledger';

export interface AvailabilityResult {
  available: number;
  sufficient: boolean;
}

/**
 * Check whether the requested qty is available for a given item+location.
 */
export async function checkAvailability(
  pool: Pool,
  tenantSlug: string,
  itemId: string,
  locationId: string,
  requiredQty: number,
  batchId?: string,
): Promise<AvailabilityResult> {
  const available = await getAvailableStock(pool, tenantSlug, itemId, locationId, batchId);
  return { available, sufficient: available >= requiredQty };
}

export interface BatchAllocation {
  batchId: string | null;
  qty: number;
  postedAt: Date;
  expiresAt?: Date;
}

export interface DrawDownResult {
  allocations: BatchAllocation[];
  movements: StockMovement[];
}

/**
 * Draw down stock using FIFO or FEFO method.
 *
 * FIFO: oldest movements consumed first (order by posted_at ASC).
 * FEFO: earliest-expiry batches consumed first.
 *       Since expiry metadata is not stored in stock_movements, FEFO is
 *       approximated by batch_id alphabetical order (a convention where
 *       batch IDs encode expiry).  Callers with true expiry data should
 *       pre-sort and call with explicit batchId per allocation.
 *
 * Returns the list of batches allocated and the resulting OUT movements.
 * Throws InsufficientStockError if total available < qty.
 */
export async function drawDown(
  pool: Pool,
  tenantSlug: string,
  itemId: string,
  locationId: string,
  qty: number,
  drawDownMethod: 'FIFO' | 'FEFO',
  sourceTableId: string = 'draw_down',
  sourceRecordId: string = '',
  postedBy: string = 'system',
): Promise<DrawDownResult> {
  // Fetch all in-movements grouped by batch, net balance per batch
  // Order by posted_at ASC for FIFO, by batch_id ASC for FEFO approximation
  const orderBy = drawDownMethod === 'FIFO' ? 'MIN(posted_at) ASC' : 'batch_id ASC NULLS LAST';

  const result = await pool.query(
    `SELECT
       batch_id,
       MIN(posted_at) AS first_posted_at,
       SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END) AS balance
     FROM public.stock_movements
     WHERE reversed = false
       AND tenant_slug = $1
       AND item_id = $2
       AND location_id = $3
     GROUP BY batch_id
     HAVING SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END) > 0
     ORDER BY ${orderBy}`,
    [tenantSlug, itemId, locationId],
  );

  const batches = result.rows as Array<{
    batch_id: string | null;
    first_posted_at: string;
    balance: string;
  }>;

  // Compute total available
  const totalAvailable = batches.reduce((sum, b) => sum + Number(b.balance), 0);
  if (totalAvailable < qty) {
    throw new InsufficientStockError(itemId, locationId, qty, totalAvailable);
  }

  const allocations: BatchAllocation[] = [];
  const movements: StockMovement[] = [];
  let remaining = qty;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const batchBalance = Number(batch.balance);
    const take = Math.min(batchBalance, remaining);

    const movement = await postMovement(pool, tenantSlug, {
      tenantSlug,
      itemId,
      locationId,
      batchId: batch.batch_id ?? undefined,
      direction: 'out',
      qty: take,
      sourceTableId,
      sourceRecordId,
      postedBy,
    });

    allocations.push({
      batchId: batch.batch_id,
      qty: take,
      postedAt: new Date(batch.first_posted_at),
    });
    movements.push(movement);
    remaining -= take;
  }

  return { allocations, movements };
}
