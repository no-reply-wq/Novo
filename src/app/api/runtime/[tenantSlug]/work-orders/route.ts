/**
 * GET /api/runtime/[tenantSlug]/work-orders
 * List work orders for an app.
 *
 * Query params:
 *   appId   — required
 *   status  — optional filter
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { WorkOrderRow, WorkOrderConsumptionRow } from '@/platform/manufacturing/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  await params; // tenantSlug available if needed for auth

  const url = new URL(req.url);
  const appId = url.searchParams.get('appId');
  const status = url.searchParams.get('status');

  if (!appId) {
    return NextResponse.json({ error: 'appId query param is required' }, { status: 400 });
  }

  let workOrderRows: WorkOrderRow[];

  if (status) {
    workOrderRows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT * FROM platform.work_orders
      WHERE app_id = ${appId}::uuid AND status = ${status}
      ORDER BY created_at DESC
    `;
  } else {
    workOrderRows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT * FROM platform.work_orders
      WHERE app_id = ${appId}::uuid
      ORDER BY created_at DESC
    `;
  }

  if (workOrderRows.length === 0) {
    return NextResponse.json({ workOrders: [] });
  }

  const workOrderIds = workOrderRows.map((w) => w.id);

  const consumptionRows = await prisma.$queryRaw<WorkOrderConsumptionRow[]>`
    SELECT * FROM platform.work_order_consumption
    WHERE work_order_id = ANY(${workOrderIds}::uuid[])
  `;

  const consumptionByWoId = new Map<string, WorkOrderConsumptionRow[]>();
  for (const c of consumptionRows) {
    const existing = consumptionByWoId.get(c.work_order_id) ?? [];
    existing.push(c);
    consumptionByWoId.set(c.work_order_id, existing);
  }

  const workOrders = workOrderRows.map((w) => ({
    id: w.id,
    bomId: w.bom_id,
    productId: w.product_id,
    targetQty: parseFloat(w.target_qty),
    unit: w.unit,
    status: w.status,
    plannedStart: w.planned_start,
    plannedEnd: w.planned_end,
    createdAt: w.created_at,
    consumptionLines: (consumptionByWoId.get(w.id) ?? []).map((c) => ({
      componentId: c.component_id,
      requiredQty: parseFloat(c.required_qty),
      issuedQty: parseFloat(c.issued_qty),
      returnedQty: parseFloat(c.returned_qty),
      unit: c.unit,
      status: c.status,
    })),
  }));

  return NextResponse.json({ workOrders });
}
