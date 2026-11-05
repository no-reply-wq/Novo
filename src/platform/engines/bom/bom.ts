/**
 * BOM (Bill of Materials) engine.
 *
 * Provides recipe scaling, availability checks, and consumption posting.
 */

import { Pool } from 'pg';
import { StockMovement } from '../stock/ledger';
import { checkAvailability } from '../stock/availability';
import { postMovement } from '../stock/ledger';

export interface BomLine {
  itemId: string;
  qty: number;
  unit?: string;
}

export interface BomAvailabilityLine {
  itemId: string;
  required: number;
  available: number;
  sufficient: boolean;
}

/**
 * Scale a BOM recipe by the desired output quantity.
 * Each component qty is multiplied proportionally.
 * Quantities are rounded to 6 decimal places to avoid floating-point drift.
 */
export function scaleBom(recipe: BomLine[], outputQty: number): BomLine[] {
  if (outputQty <= 0) {
    throw new Error(`outputQty must be positive, got ${outputQty}`);
  }
  return recipe.map((line) => ({
    ...line,
    qty: Math.round(line.qty * outputQty * 1_000_000) / 1_000_000,
  }));
}

/**
 * Check whether all BOM components are available to produce outputQty units.
 * Returns one entry per BomLine with required/available/sufficient fields.
 */
export async function checkBomAvailability(
  pool: Pool,
  tenantSlug: string,
  recipe: BomLine[],
  outputQty: number,
  locationId: string,
): Promise<BomAvailabilityLine[]> {
  const scaled = scaleBom(recipe, outputQty);

  const results: BomAvailabilityLine[] = await Promise.all(
    scaled.map(async (line) => {
      const { available, sufficient } = await checkAvailability(
        pool,
        tenantSlug,
        line.itemId,
        locationId,
        line.qty,
      );
      return {
        itemId: line.itemId,
        required: line.qty,
        available,
        sufficient,
      };
    }),
  );

  return results;
}

/**
 * Consume BOM components: posts one OUT movement per BomLine.
 * Does NOT check availability first — callers should call checkBomAvailability.
 * Returns all posted movements.
 */
export async function consumeBom(
  pool: Pool,
  tenantSlug: string,
  recipe: BomLine[],
  outputQty: number,
  locationId: string,
  sourceRecordId: string,
  postedBy: string,
  sourceTableId: string = 'bom_production',
): Promise<StockMovement[]> {
  const scaled = scaleBom(recipe, outputQty);

  const movements: StockMovement[] = [];
  for (const line of scaled) {
    const movement = await postMovement(pool, tenantSlug, {
      tenantSlug,
      itemId: line.itemId,
      locationId,
      direction: 'out',
      qty: line.qty,
      sourceTableId,
      sourceRecordId,
      postedBy,
    });
    movements.push(movement);
  }

  return movements;
}
