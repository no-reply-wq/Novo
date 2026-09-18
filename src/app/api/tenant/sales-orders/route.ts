import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const SOSchema = z.object({
  quotationId: z.string().optional(),
  clientId: z.string().optional(),
  date: z.string(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'sales', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const [orders, countResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT so.*, c.company as client_company, q.number as quotation_number
       FROM sales_orders so
       LEFT JOIN clients c ON c.id = so.client_id
       LEFT JOIN quotations q ON q.id = so.quotation_id
       ORDER BY so.created_at DESC
       LIMIT $1 OFFSET $2`, [pageSize, offset]),
    tenantQuery<{ count: string }>(ctx.schemaName, 'SELECT COUNT(*) as count FROM sales_orders'),
  ]);

  return NextResponse.json({ orders: orders.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10), page, pageSize });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'sales', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = SOSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  const soId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    const countResult = await client.query('SELECT COUNT(*) as count FROM sales_orders');
    const count = parseInt((countResult.rows[0] as { count: string }).count, 10);
    const number = `SO-${String(count + 1).padStart(4, '0')}`;

    // Resolve client from quotation if provided
    let clientId = d.clientId ?? null;
    let subtotal = 0, taxAmount = 0, total = 0;

    if (d.quotationId) {
      const q = await client.query(
        'SELECT client_id, subtotal, tax_amount, total FROM quotations WHERE id = $1', [d.quotationId]);
      if (q.rows.length > 0) {
        const qRow = q.rows[0] as { client_id: string; subtotal: number; tax_amount: number; total: number };
        clientId = qRow.client_id;
        subtotal = qRow.subtotal;
        taxAmount = qRow.tax_amount;
        total = qRow.total;
      }
    }

    await client.query(
      `INSERT INTO sales_orders (id, number, quotation_id, client_id, date, delivery_date,
                                  status, subtotal, tax_amount, total, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11)`,
      [id, number, d.quotationId ?? null, clientId, d.date, d.deliveryDate ?? null,
       subtotal, taxAmount, total, d.notes ?? null, ctx.userId]
    );

    // Copy line items from quotation if provided
    if (d.quotationId) {
      const qItems = await client.query(
        'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order', [d.quotationId]);
      for (const item of qItems.rows as Record<string, unknown>[]) {
        await client.query(
          `INSERT INTO sales_order_items (id, sales_order_id, product_id, description, quantity, unit_price, tax_percent, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [uuid(), id, item.product_id, item.description, item.quantity, item.unit_price, item.tax_percent, item.amount, item.sort_order]
        );
      }

      // Mark quotation as converted
      await client.query("UPDATE quotations SET status = 'converted', updated_at = NOW() WHERE id = $1", [d.quotationId]);
    }

    return id;
  });

  return NextResponse.json({ id: soId }, { status: 201 });
}
