import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { WorkOrderRow } from '@/platform/manufacturing/types';
import { requireTenantSession } from '@/lib/auth/tenant-session';

// GET /api/runtime/[tenantSlug]/work-orders?appId=...&status=...
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const appId = searchParams.get('appId');
  const status = searchParams.get('status');

  if (!appId) {
    return NextResponse.json({ error: 'appId query param is required' }, { status: 400 });
  }

  let rows: WorkOrderRow[];
  if (status) {
    rows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT * FROM platform.work_orders
      WHERE app_id = ${appId}::uuid AND status = ${status}
      ORDER BY created_at DESC
    `;
  } else {
    rows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT * FROM platform.work_orders
      WHERE app_id = ${appId}::uuid
      ORDER BY created_at DESC
    `;
  }

  return NextResponse.json(
    rows.map((r: WorkOrderRow) => ({
      id: r.id,
      appId: r.app_id,
      bomId: r.bom_id,
      productId: r.product_id,
      targetQty: parseFloat(r.target_qty),
      unit: r.unit,
      status: r.status,
      plannedStart: r.planned_start,
      plannedEnd: r.planned_end,
      createdAt: r.created_at,
    }))
  );
}
