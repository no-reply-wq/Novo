import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function PATCH(req: NextRequest, { params: _params }: { params: Promise<{ poId: string }> }) {
  const params = await _params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { status } = await req.json().catch(() => ({}));
  const valid = ['sent', 'acknowledged', 'partially_received', 'received', 'cancelled'];
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  await tenantQuery(ctx.schemaName,
    'UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, params.poId]);

  return NextResponse.json({ success: true });
}
