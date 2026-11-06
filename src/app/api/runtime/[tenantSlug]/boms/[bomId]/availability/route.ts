import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { checkMaterialAvailability } from '@/platform/manufacturing/bom-engine';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

// GET /api/runtime/[tenantSlug]/boms/[bomId]/availability?targetQty=50&locationId=...
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; bomId: string }> }
) {
  const { tenantSlug, bomId } = await params;
  const { searchParams } = new URL(req.url);
  const targetQty = parseFloat(searchParams.get('targetQty') ?? '1');
  const locationId = searchParams.get('locationId') ?? undefined;
  const appId = searchParams.get('appId');

  if (!appId) {
    return NextResponse.json({ error: 'appId query param is required' }, { status: 400 });
  }
  if (isNaN(targetQty) || targetQty <= 0) {
    return NextResponse.json({ error: 'targetQty must be a positive number' }, { status: 400 });
  }

  const [header] = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid AND is_active = true
  `;
  if (!header) return NextResponse.json({ error: 'BOM not found' }, { status: 404 });

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT * FROM platform.bom_lines WHERE bom_id = ${bomId}::uuid ORDER BY is_by_product, display_order
  `;

  const bom = {
    id: header.id,
    appId: header.app_id,
    productId: header.product_id,
    productName: header.product_name,
    unit: header.unit,
    version: header.version,
    isActive: header.is_active,
    notes: header.notes ?? undefined,
    components: lines
      .filter((l: BOMLineRow) => !l.is_by_product)
      .map((l: BOMLineRow) => ({
        id: l.id,
        bomId: l.bom_id,
        componentId: l.component_id,
        componentName: l.component_name,
        qtyPerUnit: parseFloat(l.qty_per_unit),
        unit: l.unit,
        wastePercent: parseFloat(l.waste_percent),
        isOptional: l.is_optional,
        substituteIds: l.substitute_ids ?? [],
      })),
    byProducts: lines
      .filter((l: BOMLineRow) => l.is_by_product)
      .map((l: BOMLineRow) => ({
        id: l.id,
        bomId: l.bom_id,
        componentId: l.component_id,
        componentName: l.component_name,
        qtyPerUnit: parseFloat(l.qty_per_unit),
        unit: l.unit,
        wastePercent: parseFloat(l.waste_percent),
        isOptional: l.is_optional,
        substituteIds: l.substitute_ids ?? [],
      })),
  };

  const availability = await checkMaterialAvailability(tenantSlug, bom, targetQty, locationId);
  const canFulfil = availability.filter((a: { shortage: number }) => a.shortage > 0).length === 0;

  return NextResponse.json({ canFulfil, availability });
}
