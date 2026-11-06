import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { WorkOrderConsumptionRow, WorkOrderRow } from '@/platform/manufacturing/types';

type IssueEntry = { componentId: string; issuedQty: number };

function computeStatus(
  netIssued: number,
  requiredQty: number
): 'Pending' | 'Partial' | 'Issued' | 'Returned' {
  if (netIssued <= 0) return netIssued < 0 ? 'Returned' : 'Pending';
  if (netIssued >= requiredQty) return 'Issued';
  return 'Partial';
}

// POST /api/runtime/[tenantSlug]/work-orders/[id]/issue-materials
// Body: { issues: [{ componentId, issuedQty }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { issues } = body as { issues: IssueEntry[] };

  if (!Array.isArray(issues) || issues.length === 0) {
    return NextResponse.json({ error: 'issues array is required' }, { status: 400 });
  }

  // Load work order
  const [wo] = await prisma.$queryRaw<WorkOrderRow[]>`
    SELECT * FROM platform.work_orders WHERE id = ${id}::uuid
  `;
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });

  if (wo.status === 'Completed' || wo.status === 'Cancelled') {
    return NextResponse.json(
      { error: `Cannot issue materials to a ${wo.status} work order` },
      { status: 409 }
    );
  }

  // Load consumption lines
  const consumptionLines = await prisma.$queryRaw<WorkOrderConsumptionRow[]>`
    SELECT * FROM platform.work_order_consumption WHERE work_order_id = ${id}::uuid
  `;

  const updatedLines: WorkOrderConsumptionRow[] = [];

  for (const issue of issues) {
    const line = consumptionLines.find(
      (l: WorkOrderConsumptionRow) => l.component_id === issue.componentId
    );
    if (!line) continue;

    const newIssued = parseFloat(line.issued_qty) + issue.issuedQty;
    const requiredQty = parseFloat(line.required_qty);
    const returnedQty = parseFloat(line.returned_qty);
    const netIssued = newIssued - returnedQty;
    const newStatus = computeStatus(netIssued, requiredQty);

    await prisma.$executeRaw`
      UPDATE platform.work_order_consumption
      SET issued_qty = ${newIssued}, status = ${newStatus}
      WHERE id = ${line.id}::uuid
    `;

    updatedLines.push({ ...line, issued_qty: String(newIssued), status: newStatus });
  }

  // Auto-advance: Draft → Released when first materials are issued
  if (wo.status === 'Draft') {
    await prisma.$executeRaw`
      UPDATE platform.work_orders SET status = 'Released', updated_at = NOW() WHERE id = ${id}::uuid
    `;
  }

  return NextResponse.json({ ok: true, updatedLines });
}
