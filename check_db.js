const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://aniketpattanayak@localhost:5432/novo' });

async function main() {
  const tables = [
    'ct_customers', 'ct_leads', 'ct_products', 'ct_suppliers',
    'ct_inventory', 'ct_expense_categories', 'ct_employees', 'ct_vehicles',
    'ct_purchase_orders', 'ct_sales_orders', 'ct_dispatch_orders',
    'ct_expenses', 'ct_vehicle_logs', 'ct_quotations', 'ct_sales_orders',
    'ct_stock_movements', 'ct_production_orders', 'ct_bom'
  ];
  for (const t of tables) {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       AND column_name NOT IN ('id','created_at','updated_at')
       ORDER BY ordinal_position`,
      ['tenant_colorplas', t]
    );
    console.log(t + ': ' + r.rows.map(x => x.column_name).join(', '));
  }
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
