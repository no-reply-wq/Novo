import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuid } from 'uuid';

const MASTER_QUERIES: Record<string, string> = {
  lead_stages: `SELECT id, name, color, sort_order, is_won, is_lost FROM lead_stages ORDER BY sort_order`,
  clients: `SELECT cl.id, cl.company, cl.contact_name, cl.email, cl.phone, cl.gst_number, pt.name as payment_term_name
            FROM clients cl LEFT JOIN payment_terms pt ON pt.id = cl.payment_term_id ORDER BY cl.company`,
  vendors: `SELECT v.id, v.company, v.contact_name, v.email, v.phone, v.gst_number,
                   v.bank_name, v.bank_account, v.bank_ifsc, pt.name as payment_term_name
            FROM vendors v LEFT JOIN payment_terms pt ON pt.id = v.payment_term_id ORDER BY v.company`,
  products: `SELECT p.id, p.name, p.sku, p.type, p.unit_cost, p.unit_price, p.reorder_point, p.active,
                    pc.name as category, u.abbreviation as uom
             FROM products p
             LEFT JOIN product_categories pc ON pc.id = p.category_id
             LEFT JOIN uoms u ON u.id = p.uom_id
             WHERE p.active = true ORDER BY p.name`,
  product_categories: `SELECT id, name, parent_id FROM product_categories ORDER BY name`,
  categories: `SELECT id, name, parent_id FROM product_categories ORDER BY name`,
  uoms: `SELECT id, name, abbreviation FROM uoms ORDER BY name`,
  payment_terms: `SELECT id, name, days FROM payment_terms ORDER BY days`,
  warehouses: `SELECT id, name FROM warehouses WHERE active = true ORDER BY name`,
  expense_categories: `SELECT id, name FROM expense_categories ORDER BY name`,
  roles: `SELECT id, name FROM roles ORDER BY name`,
  users: `SELECT id, name, email, role_id FROM users WHERE active = true ORDER BY name`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const type = searchParams.get('type');
  if (!tenantSlug || !type) return NextResponse.json({ error: 'Missing tenant or type' }, { status: 400 });
  if (!MASTER_QUERIES[type]) return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const result = await tenantQuery(ctx.schemaName, MASTER_QUERIES[type]);
  return NextResponse.json({ items: result.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const type = searchParams.get('type');
  if (!tenantSlug || !type) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const id = uuid();

  switch (type) {
    case 'clients':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO clients (id, company, contact_name, email, phone, address, gst_number, payment_term_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, body.company, body.contactName ?? null, body.email ?? null, body.phone ?? null,
         body.address ?? null, body.gstNumber ?? null, body.paymentTermId || null]);
      break;

    case 'vendors':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO vendors (id, company, contact_name, email, phone, address, gst_number,
                              payment_term_id, bank_name, bank_account, bank_ifsc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, body.company, body.contactName ?? null, body.email ?? null, body.phone ?? null,
         body.address ?? null, body.gstNumber ?? null, body.paymentTermId || null,
         body.bankName ?? null, body.bankAccount ?? null, body.bankIfsc ?? null]);
      break;

    case 'products': {
      // Auto-generate SKU if blank
      let sku = body.sku;
      if (!sku) {
        const prefix = (body.name ?? 'PRD').slice(0, 3).toUpperCase();
        const count = await tenantQuery<{ count: string }>(ctx.schemaName, 'SELECT COUNT(*) as count FROM products');
        sku = `${prefix}-${String(parseInt(count.rows[0]?.count ?? '0') + 1).padStart(4, '0')}`;
      }
      await tenantQuery(ctx.schemaName,
        `INSERT INTO products (id, name, sku, description, category_id, uom_id, type, unit_cost, unit_price, reorder_point)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, body.name, sku, body.description ?? null, body.categoryId || null,
         body.uomId || null, body.type ?? 'product', body.unitCost ?? 0, body.unitPrice ?? 0, body.reorderPoint ?? 0]);
      break;
    }

    case 'product_categories':
    case 'categories':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO product_categories (id, name, parent_id) VALUES ($1,$2,$3)`,
        [id, body.name, body.parentId || null]);
      break;

    case 'uoms':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO uoms (id, name, abbreviation) VALUES ($1,$2,$3)`,
        [id, body.name, body.abbreviation]);
      break;

    case 'payment_terms':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO payment_terms (id, name, days) VALUES ($1,$2,$3)`,
        [id, body.name, body.days ?? 0]);
      break;

    case 'expense_categories':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO expense_categories (id, name) VALUES ($1,$2)`, [id, body.name]);
      break;

    case 'warehouses':
      await tenantQuery(ctx.schemaName,
        `INSERT INTO warehouses (id, name) VALUES ($1,$2)`, [id, body.name]);
      break;

    default:
      return NextResponse.json({ error: `Create not supported for: ${type}` }, { status: 400 });
  }

  return NextResponse.json({ id }, { status: 201 });
}
