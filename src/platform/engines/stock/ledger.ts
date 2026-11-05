/**
 * Stock ledger — core movement posting and balance queries.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { MovementAlreadyReversedError, StockError } from './errors';

export interface StockMovement {
  id: string;
  tenantSlug: string;
  itemId: string;
  locationId: string;
  batchId?: string;
  direction: 'in' | 'out';
  qty: number;
  sourceTableId: string;
  sourceRecordId: string;
  postedAt: Date;
  postedBy: string;
  reversed: boolean;
  reversalId?: string;
}

function rowToMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: row.id as string,
    tenantSlug: row.tenant_slug as string,
    itemId: row.item_id as string,
    locationId: row.location_id as string,
    batchId: (row.batch_id as string | null) ?? undefined,
    direction: row.direction as 'in' | 'out',
    qty: Number(row.qty),
    sourceTableId: row.source_table_id as string,
    sourceRecordId: row.source_record_id as string,
    postedAt: new Date(row.posted_at as string),
    postedBy: row.posted_by as string,
    reversed: row.reversed as boolean,
    reversalId: (row.reversal_id as string | null) ?? undefined,
  };
}

/**
 * Post a stock movement. Returns the saved movement including generated id and postedAt.
 */
export async function postMovement(
  pool: Pool,
  tenantSlug: string,
  movement: Omit<StockMovement, 'id' | 'postedAt' | 'reversed'>,
): Promise<StockMovement> {
  if (movement.qty <= 0) {
    throw new StockError(`qty must be positive, got ${movement.qty}`);
  }

  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO public.stock_movements
      (id, tenant_slug, item_id, location_id, batch_id, direction, qty,
       source_table_id, source_record_id, posted_by, reversed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
     RETURNING *`,
    [
      id,
      tenantSlug,
      movement.itemId,
      movement.locationId,
      movement.batchId ?? null,
      movement.direction,
      movement.qty,
      movement.sourceTableId,
      movement.sourceRecordId,
      movement.postedBy,
    ],
  );

  return rowToMovement(result.rows[0]);
}

/**
 * Get available (net) stock for an item/location, optionally filtered by batch.
 * Net = SUM(in) - SUM(out) for non-reversed movements.
 */
export async function getAvailableStock(
  pool: Pool,
  tenantSlug: string,
  itemId: string,
  locationId: string,
  batchId?: string,
): Promise<number> {
  const params: unknown[] = [tenantSlug, itemId, locationId];
  let batchClause = 'AND batch_id IS NULL';
  if (batchId !== undefined) {
    params.push(batchId);
    batchClause = `AND batch_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END), 0) AS balance
     FROM public.stock_movements
     WHERE reversed = false
       AND tenant_slug = $1
       AND item_id = $2
       AND location_id = $3
       ${batchClause}`,
    params,
  );

  return Number(result.rows[0].balance);
}

/**
 * Reverse a movement by creating a mirror entry with the opposite direction.
 * The original movement is marked reversed=true; the new mirror points back via reversalId.
 */
export async function reverseMovement(
  pool: Pool,
  tenantSlug: string,
  movementId: string,
  reversedBy: string,
): Promise<StockMovement> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock original row
    const orig = await client.query(
      `SELECT * FROM public.stock_movements WHERE id = $1 AND tenant_slug = $2 FOR UPDATE`,
      [movementId, tenantSlug],
    );

    if (orig.rows.length === 0) {
      throw new StockError(`Movement ${movementId} not found for tenant ${tenantSlug}`);
    }

    const original = rowToMovement(orig.rows[0]);

    if (original.reversed) {
      throw new MovementAlreadyReversedError(movementId);
    }

    // Create mirror
    const mirrorId = randomUUID();
    const mirrorDirection: 'in' | 'out' = original.direction === 'in' ? 'out' : 'in';

    const mirrorResult = await client.query(
      `INSERT INTO public.stock_movements
        (id, tenant_slug, item_id, location_id, batch_id, direction, qty,
         source_table_id, source_record_id, posted_by, reversed, reversal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)
       RETURNING *`,
      [
        mirrorId,
        tenantSlug,
        original.itemId,
        original.locationId,
        original.batchId ?? null,
        mirrorDirection,
        original.qty,
        original.sourceTableId,
        original.sourceRecordId,
        reversedBy,
        movementId,
      ],
    );

    // Mark original as reversed
    await client.query(
      `UPDATE public.stock_movements SET reversed = true WHERE id = $1`,
      [movementId],
    );

    await client.query('COMMIT');
    return rowToMovement(mirrorResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
