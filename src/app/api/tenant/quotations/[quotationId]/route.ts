import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['approved', 'rejected'],
  approved: ['converted'],
  rejected: [],
  converted: [],
};

export async function PATCH(req: NextRequest, { params: _params }: { params: Promise<{ quotationId: string }> }) {
  const params = await _params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'quotations', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { status } = await req.json().catch(() => ({}));

  // Validate transition
  const current = await tenantQuery<{ status: string }>(ctx.schemaName,
    'SELECT status FROM quotations WHERE id = $1', [params.quotationId]);
  if (current.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentStatus = current.rows[0].status;
  if (!VALID_TRANSITIONS[currentStatus]?.includes(status)) {
    return NextResponse.json({ error: `Cannot transition from ${currentStatus} to ${status}` }, { status: 422 });
  }

  await tenantQuery(ctx.schemaName,
    'UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2', [status, params.quotationId]);

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest, { params: _params }: { params: Promise<{ quotationId: string }> }) {
  const params = await _params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'quotations', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const [q, items] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT q.*, c.company as client_company FROM quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = $1`,
      [params.quotationId]),
    tenantQuery(ctx.schemaName,
      `SELECT qi.*, p.name as product_name FROM quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = $1 ORDER BY qi.sort_order`,
      [params.quotationId]),
  ]);

  if (q.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ quotation: q.rows[0], items: items.rows });
}
