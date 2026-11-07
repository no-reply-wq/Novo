/**
 * BOM/Recipe engine — Wave 2 Agent H.
 * Provides BOM scaling, shortage checking, and consumption line prefill.
 */

import { Pool } from 'pg';
import { getStockBalance } from '../stock/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BomLine {
  itemId: string;
  qtyPer: number; // qty per 1 unit of output
  unit: string;
}

export interface Bom {
  id: string;
  appId: string;
  productId: string;
  version: string;
  lines: BomLine[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scale a BOM to the target output quantity.
 * Returns each component with its scaled qty added.
 */
export function scaleBom(
  bom: Bom,
  targetQty: number,
): Array<BomLine & { scaledQty: number }> {
  if (targetQty <= 0) {
    throw new Error(`targetQty must be positive, got ${targetQty}`);
  }
  return bom.lines.map((line) => ({
    ...line,
    scaledQty: Math.round(line.qtyPer * targetQty * 1_000_000) / 1_000_000,
  }));
}

/**
 * Check which BOM components are short for the given target quantity and location.
 * Returns only items where available < required.
 */
export async function checkBomShortages(
  bom: Bom,
  targetQty: number,
  locationId: string,
  appId: string,
  pgPool: Pool,
): Promise<Array<{ itemId: string; required: number; available: number; shortage: number }>> {
  const scaled = scaleBom(bom, targetQty);

  const results = await Promise.all(
    scaled.map(async (line) => {
      const available = await getStockBalance(appId, line.itemId, locationId, pgPool);
      const shortage = line.scaledQty - available;
      return { itemId: line.itemId, required: line.scaledQty, available, shortage };
    }),
  );

  return results.filter((r) => r.shortage > 0);
}

/**
 * Pre-fill consumption lines for a production order from this BOM.
 * Returns qty, unit per component scaled to targetQty.
 */
export async function autoFillConsumptionLines(
  bom: Bom,
  targetQty: number,
  locationId: string,
): Promise<Array<{ itemId: string; qty: number; unit: string }>> {
  void locationId; // available for future reservation logic
  const scaled = scaleBom(bom, targetQty);
  return scaled.map((line) => ({
    itemId: line.itemId,
    qty: line.scaledQty,
    unit: line.unit,
  }));
}
