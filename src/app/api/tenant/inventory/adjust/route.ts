import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const AdjustmentSchema = z.object({
  productId: z.string(),
  warehouseId: z.string(),
  transactionType: z.enum(['in', 'out']),
  quantity: z.number().min(0.001),
  unitCost: z.number().min(0).default(0),
  reason: z.enum(['opening_stock', 'write_off', 'correction', 'transfer', 'damage', 'other']),
  notes: z.string().optional(),
  batchNumber: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  // Require inventory edit permission for manual adjustments
  const ctx = await requirePermission(tenantSlug, 'inventory', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = AdjustmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  // For 'out' adjustments, verify there's enough stock
  if (d.transactionType === 'out') {
    const stockResult = await tenantQuery<{ current_stock: string }>(
      ctx.schemaName,
      `SELECT COALESCE(SUM(quantity), 0) as current_stock
       FROM stock_ledger
       WHERE product_id = $1 AND warehouse_id = $2`,
      [d.productId, d.warehouseId]
    );
    const current = parseFloat(stockResult.rows[0]?.current_stock ?? '0');
    if (current < d.quantity) {
      return NextResponse.json({
        error: `Insufficient stock. Current: ${current}, Requested: ${d.quantity}`,
      }, { status: 422 });
    }
  }

  const id = uuid();
  await tenantQuery(ctx.schemaName,
    `INSERT INTO stock_ledger
       (id, product_id, warehouse_id, transaction_type, quantity,
        unit_cost, reference_type, reference_id, batch_number, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'manual_adjustment',$7,$8,$9,$10)`,
    [id, d.productId, d.warehouseId, d.transactionType, d.quantity,
     d.unitCost, id, d.batchNumber ?? null,
     `${d.reason}${d.notes ? ': ' + d.notes : ''}`, ctx.userId]
  );

  // Return updated stock level
  const updated = await tenantQuery<{ current_stock: string }>(ctx.schemaName,
    `SELECT COALESCE(SUM(quantity * CASE WHEN transaction_type = 'in' THEN 1 ELSE -1 END), 0) as current_stock
     FROM stock_ledger WHERE product_id = $1 AND warehouse_id = $2`,
    [d.productId, d.warehouseId]
  );

  return NextResponse.json({
    id,
    currentStock: parseFloat(updated.rows[0]?.current_stock ?? '0'),
  }, { status: 201 });
}
