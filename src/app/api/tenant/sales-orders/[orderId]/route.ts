import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['delivered', 'cancelled'],
  delivered: ['invoiced'],
  invoiced: [],
  cancelled: [],
};

export async function PATCH(req: NextRequest, { params }: { params: { orderId: string } }) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'sales', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { status } = await req.json().catch(() => ({}));

  const current = await tenantQuery<{ status: string }>(ctx.schemaName,
    'SELECT status FROM sales_orders WHERE id = $1', [params.orderId]);
  if (current.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentStatus = current.rows[0].status;
  if (!VALID_TRANSITIONS[currentStatus]?.includes(status)) {
    return NextResponse.json({ error: `Cannot transition ${currentStatus} → ${status}` }, { status: 422 });
  }

  await tenantQuery(ctx.schemaName,
    'UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, params.orderId]);

  return NextResponse.json({ success: true });
}
