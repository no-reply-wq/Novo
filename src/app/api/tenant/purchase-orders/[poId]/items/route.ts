import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest, { params: _params }: { params: Promise<{ poId: string }> }) {
  const params = await _params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const items = await tenantQuery(ctx.schemaName,
    `SELECT poi.*,
            p.name as product_name,
            COALESCE(
              (SELECT SUM(gri.quantity_received)
               FROM goods_receipt_items gri
               WHERE gri.po_item_id = poi.id), 0
            ) as quantity_received_so_far
     FROM purchase_order_items poi
     LEFT JOIN products p ON p.id = poi.product_id
     WHERE poi.purchase_order_id = $1
     ORDER BY poi.sort_order`,
    [params.poId]
  );

  return NextResponse.json({ items: items.rows });
}
