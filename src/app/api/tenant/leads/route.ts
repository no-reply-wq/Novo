import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const LeadSchema = z.object({
  title: z.string().min(1).max(300),
  clientId: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  stageId: z.string().optional(),
  expectedValue: z.number().optional(),
  probability: z.number().int().min(0).max(100).default(50),
  expectedClose: z.string().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number().optional(),
    unitPrice: z.number().optional(),
  })).default([]),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'crm', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const stageId = searchParams.get('stageId');
  const assignedTo = searchParams.get('assignedTo');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50', 10), 200);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (stageId) { params.push(stageId); conditions.push(`l.stage_id = $${params.length}`); }
  if (assignedTo) { params.push(assignedTo); conditions.push(`l.assigned_to = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(l.title ILIKE $${params.length} OR c.company ILIKE $${params.length} OR l.contact_name ILIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(pageSize, offset);

  const [leads, countResult] = await Promise.all([
    tenantQuery(
      ctx.schemaName,
      `SELECT l.*, 
              c.company as client_company,
              ls.name as stage_name, ls.color as stage_color,
              u.name as assigned_to_name
       FROM leads l
       LEFT JOIN clients c ON c.id = l.client_id
       LEFT JOIN lead_stages ls ON ls.id = l.stage_id
       LEFT JOIN users u ON u.id = l.assigned_to
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    tenantQuery<{ count: string }>(
      ctx.schemaName,
      `SELECT COUNT(*) as count FROM leads l
       LEFT JOIN clients c ON c.id = l.client_id
       ${where.replace(/LIMIT.*$/, '')}`,
      params.slice(0, -2)
    ),
  ]);

  return NextResponse.json({
    leads: leads.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page, pageSize,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'crm', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  // Get default stage if not provided
  let stageId = d.stageId;
  if (!stageId) {
    const stages = await tenantQuery(
      ctx.schemaName,
      'SELECT id FROM lead_stages ORDER BY sort_order ASC LIMIT 1'
    );
    stageId = stages.rows[0]?.id as string;
  }

  const leadId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();
    await client.query(
      `INSERT INTO leads (id, title, client_id, contact_name, email, phone,
                          stage_id, expected_value, probability, expected_close,
                          assigned_to, notes, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id, d.title, d.clientId ?? null, d.contactName ?? null,
        d.email ?? null, d.phone ?? null, stageId ?? null,
        d.expectedValue ?? null, d.probability,
        d.expectedClose ?? null, d.assignedTo ?? null,
        d.notes ?? null, d.source ?? null, ctx.userId,
      ]
    );

    for (let i = 0; i < d.items.length; i++) {
      const item = d.items[i];
      const amount = (item.quantity ?? 0) * (item.unitPrice ?? 0);
      await client.query(
        `INSERT INTO lead_items (id, lead_id, product_id, description, quantity, unit_price, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuid(), id, item.productId ?? null, item.description ?? null,
         item.quantity ?? null, item.unitPrice ?? null, amount, i]
      );
    }

    // Activity log
    await client.query(
      `INSERT INTO lead_activity (id, lead_id, user_id, type, content)
       VALUES ($1,$2,$3,'note','Lead created')`,
      [uuid(), id, ctx.userId]
    );

    return id;
  });

  const result = await tenantQuery(
    ctx.schemaName,
    `SELECT l.*, ls.name as stage_name, ls.color as stage_color
     FROM leads l
     LEFT JOIN lead_stages ls ON ls.id = l.stage_id
     WHERE l.id = $1`,
    [leadId]
  );

  return NextResponse.json({ lead: result.rows[0] }, { status: 201 });
}
