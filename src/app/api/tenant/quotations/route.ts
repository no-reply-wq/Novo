import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const QuotationItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0).default(1),
  unitPrice: z.number().min(0).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});

const QuotationSchema = z.object({
  clientId: z.string().optional(),
  leadId: z.string().optional(),
  date: z.string().optional(),
  validUntil: z.string().optional(),
  paymentTermId: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  items: z.array(QuotationItemSchema).default([]),
  // For revisioning
  revisePreviousId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'quotations', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');
  const latestOnly = searchParams.get('latestOnly') !== 'false';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50', 10), 200);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (latestOnly) conditions.push('q.is_latest = true');
  if (clientId) { params.push(clientId); conditions.push(`q.client_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`q.status = $${params.length}`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(pageSize, offset);

  const [quotations, countResult] = await Promise.all([
    tenantQuery(
      ctx.schemaName,
      `SELECT q.*, c.company as client_company, pt.name as payment_term_name
       FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN payment_terms pt ON pt.id = q.payment_term_id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    tenantQuery<{ count: string }>(
      ctx.schemaName,
      `SELECT COUNT(*) as count FROM quotations q ${where}`,
      params.slice(0, -2)
    ),
  ]);

  return NextResponse.json({
    quotations: quotations.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page, pageSize,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'quotations', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = QuotationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  const quotationId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    let threadId = uuid();
    let revision = 1;

    // If revising an existing quotation
    if (d.revisePreviousId) {
      const prev = await client.query(
        'SELECT thread_id, revision FROM quotations WHERE id = $1',
        [d.revisePreviousId]
      );
      if (prev.rows.length > 0) {
        const prevRow = prev.rows[0] as { thread_id: string; revision: number };
        threadId = prevRow.thread_id;
        revision = prevRow.revision + 1;
        // Mark previous as not latest
        await client.query(
          'UPDATE quotations SET is_latest = false WHERE thread_id = $1',
          [threadId]
        );
      }
    }

    // Generate quotation number
    const countResult = await client.query('SELECT COUNT(*) as count FROM quotations');
    const count = parseInt((countResult.rows[0] as { count: string }).count, 10);
    const number = `QT-${String(count + 1).padStart(4, '0')}${revision > 1 ? `-R${revision}` : ''}`;

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of d.items) {
      const lineAmount = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
      subtotal += lineAmount;
      taxAmount += lineAmount * (item.taxPercent / 100);
    }
    const total = subtotal + taxAmount;

    await client.query(
      `INSERT INTO quotations (id, thread_id, revision, is_latest, number, client_id, lead_id,
                               date, valid_until, payment_term_id, status,
                               subtotal, tax_amount, total, notes, terms, created_by)
       VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12,$13,$14,$15)`,
      [
        id, threadId, revision, number, d.clientId ?? null, d.leadId ?? null,
        d.date ?? null, d.validUntil ?? null, d.paymentTermId ?? null,
        subtotal, taxAmount, total, d.notes ?? null, d.terms ?? null, ctx.userId,
      ]
    );

    for (let i = 0; i < d.items.length; i++) {
      const item = d.items[i];
      const lineAmount = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
      await client.query(
        `INSERT INTO quotation_items (id, quotation_id, product_id, description, quantity, unit_price,
                                      discount_percent, tax_percent, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuid(), id, item.productId ?? null, item.description ?? null,
         item.quantity, item.unitPrice, item.discountPercent, item.taxPercent, lineAmount, i]
      );
    }

    return id;
  });

  const result = await tenantQuery(
    ctx.schemaName,
    `SELECT q.*, c.company as client_company,
            COALESCE(json_agg(qi.* ORDER BY qi.sort_order) FILTER (WHERE qi.id IS NOT NULL), '[]') as items
     FROM quotations q
     LEFT JOIN clients c ON c.id = q.client_id
     LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
     WHERE q.id = $1
     GROUP BY q.id, c.company`,
    [quotationId]
  );

  return NextResponse.json({ quotation: result.rows[0] }, { status: 201 });
}
