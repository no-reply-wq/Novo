import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const view = searchParams.get('view') ?? 'stock';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'inventory', 'view');
  if (ctx instanceof NextResponse) return ctx;

  if (view === 'stock') {
    // Current stock levels per product per warehouse
    const stock = await tenantQuery(
      ctx.schemaName,
      `SELECT p.id, p.name, p.sku, p.type,
              u.abbreviation as uom,
              c.name as category,
              w.name as warehouse,
              COALESCE(SUM(sl.quantity), 0) as current_stock,
              p.reorder_point,
              CASE WHEN COALESCE(SUM(sl.quantity), 0) <= p.reorder_point THEN true ELSE false END as below_reorder
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN uoms u ON u.id = p.uom_id
       LEFT JOIN stock_ledger sl ON sl.product_id = p.id
       LEFT JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE p.active = true
       GROUP BY p.id, p.name, p.sku, p.type, u.abbreviation, c.name, w.name, p.reorder_point
       ORDER BY p.name`
    );
    return NextResponse.json({ stock: stock.rows });
  }

  if (view === 'ledger') {
    const productId = searchParams.get('productId');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [];
    let where = '';
    if (productId) {
      params.push(productId);
      where = `WHERE sl.product_id = $${params.length}`;
    }
    params.push(pageSize, offset);

    const ledger = await tenantQuery(
      ctx.schemaName,
      `SELECT sl.*, p.name as product_name, w.name as warehouse_name, u.name as user_name
       FROM stock_ledger sl
       LEFT JOIN products p ON p.id = sl.product_id
       LEFT JOIN warehouses w ON w.id = sl.warehouse_id
       LEFT JOIN users u ON u.id = sl.created_by
       ${where}
       ORDER BY sl.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return NextResponse.json({ ledger: ledger.rows });
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
}
