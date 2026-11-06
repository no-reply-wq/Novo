/**
 * POST /api/runtime/[tenantSlug]/work-orders/[id]/issue-materials
 * Issue materials from stock to a work order.
 *
 * Body: array of { componentId, issuedQty }
 * Updates consumption line status automatically:
 *   issuedQty === 0            → Pending
 *   0 < issuedQty < requiredQty → Partial
 *   issuedQty >= requiredQty   → Issued
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { WorkOrderRow, WorkOrderConsumptionRow } from '@/platform/manufacturing/types';

interface IssueMaterialsBody {
  issues: Array<{
    componentId: string;
    issuedQty: number;
  }>;
}

function computeStatus(
  issuedQty: number,
  returnedQty: number,
  requiredQty: number
): 'Pending' | 'Issued' | 'Partial' | 'Returned' {
  const netIssued = issuedQty - returnedQty;
  if (netIssued <= 0 && returnedQty > 0) return 'Returned';
  if (netIssued <= 0) return 'Pending';
  if (netIssued >= requiredQty) return 'Issued';
  return 'Partial';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; id: string }> }
) {
  const { id: workOrderId } = await params;
  const body = (await req.json()) as IssueMaterialsBody;

  if (!Array.isArray(body.issues) || body.issues.length === 0) {
    return NextResponse.json({ error: 'issues array is required' }, { status: 400 });
  }

  // Verify work order exists and is in a valid state for material issue
  const workOrderRows = await prisma.$queryRaw<WorkOrderRow[]>`
    SELECT * FROM platform.work_orders WHERE id = ${workOrderId}::uuid
  `;

  if (workOrderRows.length === 0) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  const workOrder = workOrderRows[0];

  if (workOrder.status === 'Completed' || workOrder.status === 'Cancelled') {
    return NextResponse.json(
      { error: `Cannot issue materials to a ${workOrder.status} work order` },
      { status: 400 }
    );
  }

  // Fetch current consumption lines
  const consumptionRows = await prisma.$queryRaw<WorkOrderConsumptionRow[]>`
    SELECT * FROM platform.work_order_consumption WHERE work_order_id = ${workOrderId}::uuid
  `;

  const consumptionMap = new Map<string, WorkOrderConsumptionRow>();
  for (const c of consumptionRows) {
    consumptionMap.set(c.component_id, c);
  }

  // Update each issued component
  const updatedLines: WorkOrderConsumptionRow[] = [];
  const errors: string[] = [];

  for (const issue of body.issues) {
    if (issue.issuedQty < 0) {
      errors.push(`issuedQty for component ${issue.componentId} cannot be negative`);
      continue;
    }

    const existing = consumptionMap.get(issue.componentId);
    if (!existing) {
      errors.push(`Component ${issue.componentId} is not in this work order`);
      continue;
    }

    const newIssuedQty = parseFloat(existing.issued_qty) + issue.issuedQty;
    const returnedQty = parseFloat(existing.returned_qty);
    const requiredQty = parseFloat(existing.required_qty);
    const newStatus = computeStatus(newIssuedQty, returnedQty, requiredQty);

    const [updated] = await prisma.$queryRaw<WorkOrderConsumptionRow[]>`
      UPDATE platform.work_order_consumption
      SET issued_qty = ${newIssuedQty}, status = ${newStatus}
      WHERE work_order_id = ${workOrderId}::uuid AND component_id = ${issue.componentId}
      RETURNING *
    `;

    if (updated) updatedLines.push(updated);
  }

  if (errors.length > 0 && updatedLines.length === 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  // Auto-advance work order to Released if it's still Draft and materials are being issued
  if (workOrder.status === 'Draft') {
    await prisma.$queryRaw`
      UPDATE platform.work_orders
      SET status = 'Released', updated_at = now()
      WHERE id = ${workOrderId}::uuid AND status = 'Draft'
    `;
  }

  return NextResponse.json({
    workOrderId,
    updatedLines: updatedLines.map((l) => ({
      componentId: l.component_id,
      requiredQty: parseFloat(l.required_qty),
      issuedQty: parseFloat(l.issued_qty),
      returnedQty: parseFloat(l.returned_qty),
      unit: l.unit,
      status: l.status,
    })),
    errors: errors.length > 0 ? errors : undefined,
  });
}
