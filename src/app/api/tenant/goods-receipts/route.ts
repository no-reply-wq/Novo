import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const GRNItemSchema = z.object({
  poItemId: z.string().optional(),
  productId: z.string(),
  description: z.string().optional(),
  quantityOrdered: z.number().min(0).default(0),
  quantityReceived: z.number().min(0),
  unitCost: z.number().min(0).default(0),
  warehouseId: z.string(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
});

const GRNSchema = z.object({
  purchaseOrderId: z.string().optional(),
  receivedDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  warehouseId: z.string(),
  notes: z.string().optional(),
  items: z.array(GRNItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'inventory', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const poId = searchParams.get('poId');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  let where = '';
  if (poId) { params.push(poId); where = `WHERE gr.purchase_order_id = $${params.length}`; }
  params.push(pageSize, offset);

  const [grns, countResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT gr.*, po.number as po_number, w.name as warehouse_name, u.name as received_by_name
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
       LEFT JOIN warehouses w ON w.id = gr.warehouse_id
       LEFT JOIN users u ON u.id = gr.received_by
       ${where}
       ORDER BY gr.received_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params),
    tenantQuery<{ count: string }>(ctx.schemaName,
      `SELECT COUNT(*) as count FROM goods_receipts gr ${where}`,
      params.slice(0, -2)),
  ]);

  return NextResponse.json({
    grns: grns.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'inventory', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = GRNSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  const grnId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    const countRes = await client.query('SELECT COUNT(*) as count FROM goods_receipts');
    const count = parseInt((countRes.rows[0] as { count: string }).count, 10);
    const number = `GRN-${String(count + 1).padStart(4, '0')}`;

    await client.query(
      `INSERT INTO goods_receipts (id, number, purchase_order_id, warehouse_id, received_date, status, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,'received',$6,$7)`,
      [id, number, d.purchaseOrderId ?? null, d.warehouseId,
       d.receivedDate, d.notes ?? null, ctx.userId]
    );

    for (let i = 0; i < d.items.length; i++) {
      const item = d.items[i];

      // Insert GRN line item
      await client.query(
        `INSERT INTO goods_receipt_items
           (id, goods_receipt_id, po_item_id, product_id, description,
            quantity_ordered, quantity_received, unit_cost, warehouse_id,
            batch_number, expiry_date, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [uuid(), id, item.poItemId ?? null, item.productId,
         item.description ?? null, item.quantityOrdered, item.quantityReceived,
         item.unitCost, item.warehouseId, item.batchNumber ?? null,
         item.expiryDate ?? null, i]
      );

      // Post stock ledger entry (IN movement)
      if (item.quantityReceived > 0) {
        await client.query(
          `INSERT INTO stock_ledger
             (id, product_id, warehouse_id, transaction_type, quantity,
              unit_cost, reference_type, reference_id, batch_number, created_by)
           VALUES ($1,$2,$3,'in',$4,$5,'goods_receipt',$6,$7,$8)`,
          [uuid(), item.productId, item.warehouseId,
           item.quantityReceived, item.unitCost, id,
           item.batchNumber ?? null, ctx.userId]
        );
      }
    }

    // Update PO status to partially_received or received
    if (d.purchaseOrderId) {
      // Check if all PO items are fully received
      const poItems = await client.query(
        `SELECT poi.quantity,
                COALESCE(SUM(gri.quantity_received), 0) as total_received
         FROM purchase_order_items poi
         LEFT JOIN goods_receipt_items gri ON gri.po_item_id = poi.id
         WHERE poi.purchase_order_id = $1
         GROUP BY poi.id, poi.quantity`,
        [d.purchaseOrderId]
      );

      const allFulfilled = (poItems.rows as Array<{ quantity: number; total_received: string }>)
        .every(row => parseFloat(row.total_received) >= row.quantity);

      const newPoStatus = allFulfilled ? 'received' : 'partially_received';
      await client.query(
        'UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2',
        [newPoStatus, d.purchaseOrderId]
      );
    }

    return id;
  });

  return NextResponse.json({ id: grnId }, { status: 201 });
}
