import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const POItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0).default(1),
  unitCost: z.number().min(0).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});

const POSchema = z.object({
  vendorId: z.string().optional(),
  indentId: z.string().optional(),
  date: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTermId: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  items: z.array(POItemSchema).default([]),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conditions.push(`po.status = $${params.length}`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(pageSize, offset);

  const [pos, countResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT po.*, v.company as vendor_company, pt.name as payment_term_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN payment_terms pt ON pt.id = po.payment_term_id
       ${where} ORDER BY po.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
    tenantQuery<{ count: string }>(ctx.schemaName,
      `SELECT COUNT(*) as count FROM purchase_orders po ${where}`, params.slice(0, -2)),
  ]);

  return NextResponse.json({ pos: pos.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10), page, pageSize });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = POSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  const poId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    const countResult = await client.query('SELECT COUNT(*) as count FROM purchase_orders');
    const count = parseInt((countResult.rows[0] as { count: string }).count, 10);
    const number = `PO-${String(count + 1).padStart(4, '0')}`;

    let subtotal = 0, taxAmount = 0;
    for (const item of d.items) {
      const lineAmount = item.quantity * item.unitCost;
      subtotal += lineAmount;
      taxAmount += lineAmount * (item.taxPercent / 100);
    }

    await client.query(
      `INSERT INTO purchase_orders (id, number, vendor_id, indent_id, date, delivery_date,
                                    payment_term_id, status, subtotal, tax_amount, total, notes, terms, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13)`,
      [id, number, d.vendorId ?? null, d.indentId ?? null, d.date ?? null, d.deliveryDate ?? null,
       d.paymentTermId ?? null, subtotal, taxAmount, subtotal + taxAmount, d.notes ?? null, d.terms ?? null, ctx.userId]
    );

    for (let i = 0; i < d.items.length; i++) {
      const item = d.items[i];
      const lineAmount = item.quantity * item.unitCost;
      await client.query(
        `INSERT INTO purchase_order_items (id, purchase_order_id, product_id, description, quantity, unit_cost, tax_percent, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuid(), id, item.productId ?? null, item.description ?? null, item.quantity, item.unitCost, item.taxPercent, lineAmount, i]
      );
    }

    // Auto-fill vendor payment terms if vendor selected
    if (d.vendorId) {
      const vendor = await client.query('SELECT payment_term_id FROM vendors WHERE id = $1', [d.vendorId]);
      if (vendor.rows[0] && (vendor.rows[0] as { payment_term_id: string }).payment_term_id && !d.paymentTermId) {
        await client.query('UPDATE purchase_orders SET payment_term_id = $1 WHERE id = $2',
          [(vendor.rows[0] as { payment_term_id: string }).payment_term_id, id]);
      }
    }

    return id;
  });

  const result = await tenantQuery(ctx.schemaName,
    `SELECT po.*, v.company as vendor_company FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id WHERE po.id = $1`,
    [poId]);

  return NextResponse.json({ po: result.rows[0] }, { status: 201 });
}
