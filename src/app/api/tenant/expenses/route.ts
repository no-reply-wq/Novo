import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const ExpenseSchema = z.object({
  employeeId: z.string().optional(),
  categoryId: z.string().optional(),
  date: z.string(),
  amount: z.number().min(0),
  description: z.string().min(1),
  billable: z.boolean().default(false),
  clientId: z.string().optional(),
  notes: z.string().optional(),
  receiptUrl: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'expenses', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  const conditions: string[] = [];
  if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
  // Non-admins only see their own expenses
  if (!['admin', 'manager'].includes(ctx.roleName ?? '')) {
    params.push(ctx.userId);
    conditions.push(`e.employee_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(pageSize, offset);

  const [expenses, countResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT e.*, ec.name as category_name, u.name as employee_name, c.company as client_company
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.employee_id
       LEFT JOIN clients c ON c.id = e.client_id
       ${where} ORDER BY e.date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
    tenantQuery<{ count: string }>(ctx.schemaName,
      `SELECT COUNT(*) as count FROM expenses e ${where}`, params.slice(0, -2)),
  ]);

  return NextResponse.json({ expenses: expenses.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10), page, pageSize });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'expenses', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = ExpenseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;
  const id = uuid();

  await tenantQuery(ctx.schemaName,
    `INSERT INTO expenses (id, employee_id, category_id, date, amount, description, billable, client_id, notes, receipt_url, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
    [id, d.employeeId ?? ctx.userId, d.categoryId ?? null, d.date, d.amount,
     d.description, d.billable, d.clientId ?? null, d.notes ?? null, d.receiptUrl ?? null, ctx.userId]
  );

  const result = await tenantQuery(ctx.schemaName,
    `SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id WHERE e.id = $1`, [id]);

  return NextResponse.json({ expense: result.rows[0] }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const id = searchParams.get('id');
  if (!tenantSlug || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'expenses', 'approve');
  if (ctx instanceof NextResponse) return ctx;

  const { action } = await req.json().catch(() => ({}));
  if (!['approve', 'reject', 'pay'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const statusMap: Record<string, string> = { approve: 'approved', reject: 'rejected', pay: 'paid' };
  await tenantQuery(ctx.schemaName,
    `UPDATE expenses SET status = $1, updated_at = NOW() WHERE id = $2`, [statusMap[action], id]);

  return NextResponse.json({ success: true });
}
