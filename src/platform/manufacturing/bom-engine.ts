/**
 * BOM (Bill of Materials) engine
 * Core business logic for scaling BOMs, generating work orders, and
 * checking material availability.
 */

import type {
  BOMHeader,
  BOMLine,
  WorkOrderConsumption,
  ScaledComponent,
  MaterialAvailability,
  BOMCost,
} from './types';

// ─── Scale BOM ────────────────────────────────────────────────────────────────

/**
 * Scale a BOM to a target quantity.
 * Waste percent adds to effective quantity:
 *   requiredQty = qtyPerUnit * targetQty * (1 + wastePercent / 100)
 *
 * By-products are excluded — they are credits, not consumed materials.
 */
export function scaleBOM(
  bom: BOMHeader,
  targetQty: number
): ScaledComponent[] {
  if (targetQty <= 0) {
    throw new Error('targetQty must be greater than 0');
  }

  return bom.components.map((line: BOMLine): ScaledComponent => {
    const wasteFactor = 1 + line.wastePercent / 100;
    const requiredQty = line.qtyPerUnit * targetQty * wasteFactor;

    return {
      componentId: line.componentId,
      componentName: line.componentName,
      requiredQty,
      unit: line.unit,
      isOptional: line.isOptional,
    };
  });
}

// ─── Generate Consumption Lines ───────────────────────────────────────────────

/**
 * Generate work order consumption lines from a BOM and target quantity.
 * All lines start in Pending status with issuedQty = 0.
 */
export function generateConsumptionLines(
  bom: BOMHeader,
  targetQty: number
): WorkOrderConsumption[] {
  if (targetQty <= 0) {
    throw new Error('targetQty must be greater than 0');
  }

  const scaled = scaleBOM(bom, targetQty);

  return scaled.map((item: ScaledComponent): WorkOrderConsumption => ({
    componentId: item.componentId,
    requiredQty: item.requiredQty,
    issuedQty: 0,
    returnedQty: 0,
    unit: item.unit,
    status: 'Pending',
  }));
}

// ─── Check Material Availability ─────────────────────────────────────────────

/**
 * Check material availability for a work order against current stock.
 * Queries the tenant's inventory table for available quantities.
 *
 * Returns availability info for each component, including shortage amounts.
 */
export async function checkMaterialAvailability(
  tenantSlug: string,
  bom: BOMHeader,
  targetQty: number,
  locationId: string
): Promise<MaterialAvailability[]> {
  if (targetQty <= 0) {
    throw new Error('targetQty must be greater than 0');
  }

  const { tenantQuery } = await import('@/lib/db/client');
  const scaled = scaleBOM(bom, targetQty);

  const componentIds = scaled.map((c) => c.componentId);

  if (componentIds.length === 0) {
    return [];
  }

  // Build a map of substitute IDs for each component
  const substituteMap = new Map<string, string[]>();
  for (const line of bom.components) {
    substituteMap.set(line.componentId, line.substituteIds ?? []);
  }

  // Query stock levels from the tenant's inventory
  // Looks for a record_id matching componentId in an inventory / stock table.
  // Falls back to 0 if no inventory table exists.
  let stockMap = new Map<string, number>();

  try {
    const placeholders = componentIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await tenantQuery<{ component_id: string; available_qty: string }>(
      tenantSlug,
      `SELECT component_id, SUM(qty_on_hand) AS available_qty
       FROM inventory_stock
       WHERE location_id = $1
         AND component_id IN (${placeholders})
       GROUP BY component_id`,
      [locationId, ...componentIds]
    );

    for (const row of result.rows) {
      stockMap.set(row.component_id, parseFloat(row.available_qty));
    }
  } catch {
    // Inventory table may not exist — treat all quantities as 0
    stockMap = new Map<string, number>();
  }

  return scaled.map((item: ScaledComponent): MaterialAvailability => {
    const availableQty = stockMap.get(item.componentId) ?? 0;
    const shortage = Math.max(0, item.requiredQty - availableQty);
    const substitutes = substituteMap.get(item.componentId) ?? [];

    return {
      componentId: item.componentId,
      componentName: item.componentName,
      requiredQty: item.requiredQty,
      availableQty,
      shortage,
      hasSubstitute: substitutes.length > 0,
    };
  });
}

// ─── Calculate BOM Cost ───────────────────────────────────────────────────────

/**
 * Calculate total BOM cost for a production run.
 *
 * materialCost   = sum of (requiredQty * costPerUnit) for all components
 * byProductCredit = sum of (qtyPerUnit * targetQty * costPerUnit) for by-products
 * netCost        = materialCost - byProductCredit
 * costPerUnit    = netCost / targetQty
 */
export function calculateBOMCost(
  bom: BOMHeader,
  targetQty: number,
  componentCosts: Record<string, number> // componentId → cost per unit
): BOMCost {
  if (targetQty <= 0) {
    throw new Error('targetQty must be greater than 0');
  }

  const scaled = scaleBOM(bom, targetQty);

  const materialCost = scaled.reduce((total, item) => {
    const cost = componentCosts[item.componentId] ?? 0;
    return total + item.requiredQty * cost;
  }, 0);

  // By-products generate credits (no waste applied to by-products)
  const byProductCredit = (bom.byProducts ?? []).reduce((total, line: BOMLine) => {
    const cost = componentCosts[line.componentId] ?? 0;
    return total + line.qtyPerUnit * targetQty * cost;
  }, 0);

  const netCost = materialCost - byProductCredit;
  const costPerUnit = netCost / targetQty;

  return {
    materialCost,
    byProductCredit,
    netCost,
    costPerUnit,
  };
}
