/**
 * POST /api/runtime/[tenantSlug]/boms/[bomId]/work-order
 * Create a work order from a BOM, auto-filling consumption lines.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { generateConsumptionLines } from '@/platform/manufacturing/bom-engine';
import type {
  BOMHeaderRow,
  BOMLineRow,
  WorkOrderRow,
  WorkOrderConsumptionRow,
} from '@/platform/manufacturing/types';
import type { BOMHeader, BOMLine, WorkOrderConsumption } from '@/platform/manufacturing/types';

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

interface CreateWorkOrderBody {
  appId: string;
  targetQty: number;
  plannedStart?: string;
  plannedEnd?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; bomId: string }> }
) {
  const { bomId } = await params;
  const body = (await req.json()) as CreateWorkOrderBody;

  if (!body.appId) {
    return NextResponse.json({ error: 'appId is required' }, { status: 400 });
  }

  if (!body.targetQty || body.targetQty <= 0) {
    return NextResponse.json({ error: 'targetQty must be greater than 0' }, { status: 400 });
  }

  const bom = await fetchFullBOM(bomId);
  if (!bom) {
    return NextResponse.json({ error: 'BOM not found or inactive' }, { status: 404 });
  }

  // Generate consumption lines from BOM
  const consumptionLines: WorkOrderConsumption[] = generateConsumptionLines(bom, body.targetQty);

  // Create work order
  const [workOrderRow] = await prisma.$queryRaw<WorkOrderRow[]>`
    INSERT INTO platform.work_orders
      (app_id, bom_id, product_id, target_qty, unit, status, planned_start, planned_end)
    VALUES
      (${body.appId}::uuid, ${bomId}::uuid, ${bom.productId}, ${body.targetQty},
       ${bom.unit}, 'Draft',
       ${body.plannedStart ?? null}::date,
       ${body.plannedEnd ?? null}::date)
    RETURNING *
  `;

  if (!workOrderRow) {
    return NextResponse.json({ error: 'Failed to create work order' }, { status: 500 });
  }

  // Insert consumption lines
  const insertedLines: WorkOrderConsumptionRow[] = [];
  for (const line of consumptionLines) {
    const [insertedLine] = await prisma.$queryRaw<WorkOrderConsumptionRow[]>`
      INSERT INTO platform.work_order_consumption
        (work_order_id, component_id, required_qty, issued_qty, returned_qty, unit, status)
      VALUES
        (${workOrderRow.id}::uuid, ${line.componentId}, ${line.requiredQty},
         0, 0, ${line.unit}, 'Pending')
      RETURNING *
    `;
    if (insertedLine) insertedLines.push(insertedLine);
  }

  const workOrder = {
    id: workOrderRow.id,
    bomId: workOrderRow.bom_id,
    productId: workOrderRow.product_id,
    targetQty: parseFloat(workOrderRow.target_qty),
    unit: workOrderRow.unit,
    status: workOrderRow.status,
    plannedStart: workOrderRow.planned_start,
    plannedEnd: workOrderRow.planned_end,
    consumptionLines: insertedLines.map((l) => ({
      componentId: l.component_id,
      requiredQty: parseFloat(l.required_qty),
      issuedQty: parseFloat(l.issued_qty),
      returnedQty: parseFloat(l.returned_qty),
      unit: l.unit,
      status: l.status,
    })),
    createdAt: workOrderRow.created_at,
  };

  return NextResponse.json({ workOrder }, { status: 201 });
}
