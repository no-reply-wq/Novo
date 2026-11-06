/**
 * BOM (Bill of Materials) engine — core business logic
 */

import type {
  BOMHeader,
  ScaledComponent,
  WorkOrderConsumption,
  MaterialAvailability,
  BOMCost,
} from './types';

// ─── scaleBOM ─────────────────────────────────────────────────────────────────

/**
 * Scale a BOM's component requirements to a target production quantity.
 * By-products are excluded — they are credits, not inputs.
 */
export function scaleBOM(bom: BOMHeader, targetQty: number): ScaledComponent[] {
  if (targetQty <= 0) {
    throw new Error(`targetQty must be > 0, got ${targetQty}`);
  }

  return bom.components.map((line) => {
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

// ─── generateConsumptionLines ─────────────────────────────────────────────────

/**
 * Generate initial work-order consumption lines from a BOM + target qty.
 * All lines start with issuedQty = 0, returnedQty = 0, status = 'Pending'.
 */
export function generateConsumptionLines(
  bom: BOMHeader,
  targetQty: number
): WorkOrderConsumption[] {
  const scaled = scaleBOM(bom, targetQty);
  return scaled.map((s) => ({
    componentId: s.componentId,
    requiredQty: s.requiredQty,
    issuedQty: 0,
    returnedQty: 0,
    unit: s.unit,
    status: 'Pending' as const,
  }));
}

// ─── checkMaterialAvailability ────────────────────────────────────────────────

/**
 * Check whether the tenant's inventory can fulfil a BOM at the given qty.
 * Falls back to 0 available if the inventory_stock table is missing.
 */
export async function checkMaterialAvailability(
  tenantSlug: string,
  bom: BOMHeader,
  targetQty: number,
  locationId?: string
): Promise<MaterialAvailability[]> {
  const scaled = scaleBOM(bom, targetQty);
  const { tenantQuery } = await import('@/lib/db/client');

  const componentIds = scaled.map((s) => s.componentId);

  let stockMap: Record<string, number> = {};
  try {
    const locationClause = locationId
      ? `AND location_id = $2`
      : '';
    const params: unknown[] = locationId
      ? [componentIds, locationId]
      : [componentIds];

    const result = await tenantQuery<{ component_id: string; qty: string }>(
      `tenant_${tenantSlug}`,
      `SELECT component_id, SUM(qty_on_hand) AS qty
       FROM inventory_stock
       WHERE component_id = ANY($1) ${locationClause}
       GROUP BY component_id`,
      params
    );

    for (const row of result.rows) {
      stockMap[row.component_id] = parseFloat(row.qty) || 0;
    }
  } catch {
    // inventory_stock table may not exist — treat all as 0
    stockMap = {};
  }

  const substituteSet = new Set(
    bom.components.flatMap((c) => c.substituteIds ?? [])
  );

  return scaled.map((s) => {
    const availableQty = stockMap[s.componentId] ?? 0;
    const shortage = Math.max(0, s.requiredQty - availableQty);
    const hasSubstitute =
      (bom.components.find((c) => c.componentId === s.componentId)?.substituteIds ?? []).length > 0 ||
      substituteSet.has(s.componentId);

    return {
      componentId: s.componentId,
      componentName: s.componentName,
      requiredQty: s.requiredQty,
      availableQty,
      shortage,
      hasSubstitute,
    };
  });
}

// ─── calculateBOMCost ─────────────────────────────────────────────────────────

/**
 * Calculate total material cost for a production run.
 * By-product credits reduce net cost (no waste factor applied to by-products).
 */
export function calculateBOMCost(
  bom: BOMHeader,
  targetQty: number,
  componentCosts: Record<string, number>
): BOMCost {
  if (targetQty <= 0) {
    throw new Error(`targetQty must be > 0, got ${targetQty}`);
  }

  const scaled = scaleBOM(bom, targetQty);

  const materialCost = scaled.reduce((sum, s) => {
    const unitCost = componentCosts[s.componentId] ?? 0;
    return sum + s.requiredQty * unitCost;
  }, 0);

  const byProductCredit = (bom.byProducts ?? []).reduce((sum, bp) => {
    const unitCost = componentCosts[bp.componentId] ?? 0;
    return sum + bp.qtyPerUnit * targetQty * unitCost;
  }, 0);

  const netCost = materialCost - byProductCredit;
  const costPerUnit = targetQty > 0 ? netCost / targetQty : 0;

  return { materialCost, byProductCredit, netCost, costPerUnit };
}
