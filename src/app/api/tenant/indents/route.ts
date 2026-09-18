import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const IndentItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0.001),
  uomId: z.string().optional(),
  requiredDate: z.string().optional(),
  notes: z.string().optional(),
});

const IndentSchema = z.object({
  requestedBy: z.string().optional(),
  department: z.string().optional(),
  requiredDate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  notes: z.string().optional(),
  items: z.array(IndentItemSchema).min(1),
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

  const params: unknown[] = [];
  const conditions: string[] = [];
  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(pageSize, offset);

  const [indents, countResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT i.*, u.name as requested_by_name
       FROM indents i
       LEFT JOIN users u ON u.id = i.requested_by
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params),
    tenantQuery<{ count: string }>(ctx.schemaName,
      `SELECT COUNT(*) as count FROM indents i ${where}`,
      params.slice(0, -2)),
  ]);

  return NextResponse.json({
    indents: indents.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = IndentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  const indentId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    const countRes = await client.query('SELECT COUNT(*) as count FROM indents');
    const count = parseInt((countRes.rows[0] as { count: string }).count, 10);
    const number = `IND-${String(count + 1).padStart(4, '0')}`;

    await client.query(
      `INSERT INTO indents (id, number, requested_by, department, required_date, priority, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)`,
      [id, number, d.requestedBy ?? ctx.userId, d.department ?? null,
       d.requiredDate ?? null, d.priority, d.notes ?? null]
    );

    for (let i = 0; i < d.items.length; i++) {
      const item = d.items[i];
      await client.query(
        `INSERT INTO indent_items (id, indent_id, product_id, description, quantity, uom_id, required_date, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuid(), id, item.productId ?? null, item.description ?? null,
         item.quantity, item.uomId ?? null, item.requiredDate ?? null,
         item.notes ?? null, i]
      );
    }

    return id;
  });

  return NextResponse.json({ id: indentId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const indentId = searchParams.get('id');
  if (!tenantSlug || !indentId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'purchase', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { status } = await req.json().catch(() => ({}));
  const valid = ['pending', 'approved', 'rejected', 'ordered', 'closed'];
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  await tenantQuery(ctx.schemaName,
    'UPDATE indents SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, indentId]);

  return NextResponse.json({ success: true });
}
