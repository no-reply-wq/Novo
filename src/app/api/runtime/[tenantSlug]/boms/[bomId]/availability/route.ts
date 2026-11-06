/**
 * GET /api/runtime/[tenantSlug]/boms/[bomId]/availability
 * Check material availability for a BOM at a given quantity and location.
 *
 * Query params:
 *   targetQty  — number of units to produce
 *   locationId — warehouse/location ID to check stock at
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { checkMaterialAvailability } from '@/platform/manufacturing/bom-engine';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';
import type { BOMHeader, BOMLine } from '@/platform/manufacturing/types';

async function fetchFullBOM(bomId: string): Promise<BOMHeader | null> {
  const headers = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers WHERE id = ${bomId}::uuid AND is_active = true
  `;

  if (headers.length === 0) return null;

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT * FROM platform.bom_lines WHERE bom_id = ${bomId}::uuid ORDER BY display_order
  `;

  const h = headers[0];

  const toLine = (l: BOMLineRow): BOMLine => ({
    id: l.id,
    bomId: l.bom_id,
    componentId: l.component_id,
    componentName: l.component_name,
    qtyPerUnit: parseFloat(l.qty_per_unit),
    unit: l.unit,
    wastePercent: parseFloat(l.waste_percent),
    isOptional: l.is_optional,
    substituteIds: l.substitute_ids,
  });

  return {
    id: h.id,
    appId: h.app_id,
    productId: h.product_id,
    productName: h.product_name,
    unit: h.unit,
    version: h.version,
    isActive: h.is_active,
    notes: h.notes ?? undefined,
    components: lines.filter((l) => !l.is_by_product).map(toLine),
    byProducts: lines.filter((l) => l.is_by_product).map(toLine),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; bomId: string }> }
) {
  const { tenantSlug, bomId } = await params;

  const url = new URL(req.url);
  const targetQtyStr = url.searchParams.get('targetQty');
  const locationId = url.searchParams.get('locationId') ?? '';

  if (!targetQtyStr) {
    return NextResponse.json({ error: 'targetQty query param is required' }, { status: 400 });
  }

  const targetQty = parseFloat(targetQtyStr);
  if (isNaN(targetQty) || targetQty <= 0) {
    return NextResponse.json({ error: 'targetQty must be a positive number' }, { status: 400 });
  }

  const bom = await fetchFullBOM(bomId);
  if (!bom) {
    return NextResponse.json({ error: 'BOM not found or inactive' }, { status: 404 });
  }

  const availability = await checkMaterialAvailability(
    tenantSlug,
    bom,
    targetQty,
    locationId
  );

  const hasShortage = availability.some((a) => a.shortage > 0);

  return NextResponse.json({
    bomId,
    targetQty,
    hasShortage,
    availability,
  });
}
