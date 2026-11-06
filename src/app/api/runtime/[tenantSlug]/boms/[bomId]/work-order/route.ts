import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { generateConsumptionLines } from '@/platform/manufacturing/bom-engine';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

// POST /api/runtime/[tenantSlug]/boms/[bomId]/work-order
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; bomId: string }> }
) {
  const { bomId } = await params;
  const body = await req.json();
  const { appId, targetQty, plannedStart, plannedEnd } = body;

  if (!appId || !targetQty || targetQty <= 0) {
    return NextResponse.json({ error: 'appId and targetQty (> 0) are required' }, { status: 400 });
  }

  // Load BOM header
  const [header] = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid AND is_active = true
  `;
  if (!header) return NextResponse.json({ error: 'BOM not found' }, { status: 404 });

  // Load BOM lines
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

  const consumptionLines = generateConsumptionLines(bom, Number(targetQty));

  // Create work order
  const [wo] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO platform.work_orders (app_id, bom_id, product_id, target_qty, unit, status, planned_start, planned_end)
    VALUES (
      ${appId}::uuid,
      ${bomId}::uuid,
      ${header.product_id},
      ${Number(targetQty)},
      ${header.unit},
      'Draft',
      ${plannedStart ?? null},
      ${plannedEnd ?? null}
    )
    RETURNING id
  `;

  // Insert consumption lines
  for (const line of consumptionLines) {
    await prisma.$executeRaw`
      INSERT INTO platform.work_order_consumption
        (work_order_id, component_id, required_qty, issued_qty, returned_qty, unit, status)
      VALUES
        (${wo.id}::uuid, ${line.componentId}, ${line.requiredQty}, 0, 0, ${line.unit}, 'Pending')
    `;
  }

  return NextResponse.json({ id: wo.id, consumptionLines }, { status: 201 });
}
