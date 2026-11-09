import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenantSlug') ?? 'colorplas'
  const S = `tenant_${tenantSlug.replace(/[^a-z0-9_]/g, '')}`
  const r: string[] = []
  try {
    const tables: [string, string][] = [
      ['customers', `CREATE TABLE IF NOT EXISTS ${S}.customers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT, phone TEXT, city TEXT, gst_no TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['quotations', `CREATE TABLE IF NOT EXISTS ${S}.quotations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), quotation_no TEXT UNIQUE NOT NULL, customer_id TEXT, total_amount NUMERIC(12,2), status TEXT DEFAULT 'draft', valid_until DATE, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['sales_orders', `CREATE TABLE IF NOT EXISTS ${S}.sales_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_no TEXT UNIQUE NOT NULL, customer_id TEXT, total_amount NUMERIC(12,2), status TEXT DEFAULT 'pending', delivery_date DATE, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['inventory_items', `CREATE TABLE IF NOT EXISTS ${S}.inventory_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, sku TEXT UNIQUE, category TEXT, quantity NUMERIC(10,2) DEFAULT 0, unit TEXT DEFAULT 'kg', reorder_level NUMERIC(10,2) DEFAULT 50, unit_cost NUMERIC(10,2), created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['stock_movements', `CREATE TABLE IF NOT EXISTS ${S}.stock_movements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), item_id TEXT, type TEXT, quantity NUMERIC(10,2), reference TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['bom', `CREATE TABLE IF NOT EXISTS ${S}.bom (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_name TEXT NOT NULL, component TEXT NOT NULL, quantity NUMERIC(10,3), unit TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['production_orders', `CREATE TABLE IF NOT EXISTS ${S}.production_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_no TEXT UNIQUE NOT NULL, product_name TEXT, quantity NUMERIC(10,2), unit TEXT DEFAULT 'pcs', status TEXT DEFAULT 'pending', planned_date DATE, machine TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['suppliers', `CREATE TABLE IF NOT EXISTS ${S}.suppliers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, contact_person TEXT, email TEXT, phone TEXT, city TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['purchase_orders', `CREATE TABLE IF NOT EXISTS ${S}.purchase_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), po_no TEXT UNIQUE NOT NULL, supplier_id TEXT, total_amount NUMERIC(12,2), status TEXT DEFAULT 'pending', order_date DATE, delivery_date DATE, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['vehicles', `CREATE TABLE IF NOT EXISTS ${S}.vehicles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), registration_no TEXT UNIQUE NOT NULL, type TEXT, driver_name TEXT, driver_phone TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['vehicle_logs', `CREATE TABLE IF NOT EXISTS ${S}.vehicle_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id TEXT, driver TEXT, start_km NUMERIC(10,1), end_km NUMERIC(10,1), purpose TEXT, log_date DATE, fuel_expense NUMERIC(10,2), created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['dispatch_orders', `CREATE TABLE IF NOT EXISTS ${S}.dispatch_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), dispatch_no TEXT UNIQUE NOT NULL, sales_order_id TEXT, vehicle_id TEXT, driver TEXT, status TEXT DEFAULT 'pending', dispatch_date DATE, delivery_date DATE, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['expenses', `CREATE TABLE IF NOT EXISTS ${S}.expenses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, category TEXT, amount NUMERIC(10,2), status TEXT DEFAULT 'pending', expense_date DATE, approved_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`],
      ['employees', `CREATE TABLE IF NOT EXISTS ${S}.employees (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT, department TEXT, role TEXT, phone TEXT, joining_date DATE, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`],
    ]
    for (const [name, ddl] of tables) {
      await pgPool.query(`DROP TABLE IF EXISTS "${S}".${name} CASCADE`)
      await pgPool.query(ddl)
      await pgPool.query(`DELETE FROM "${S}".${name}`)
      r.push('created ' + name)
    }
    await pgPool.query(`INSERT INTO ${S}.customers (name,email,phone,city,gst_no,status) VALUES ('Rajesh Plastics Pvt Ltd','rajesh@rajesh.com','9876543210','Mumbai','27AABCR1234','active'),('Deepak Industries','info@deepak.com','9988776655','Pune','27BBBCD5678','active'),('National Polymers','np@national.in','9112233445','Delhi','07CCCDE9012','active'),('Surya Enterprises','surya@surya.com','8800991122','Chennai','33DDDEH3456','active'),('Prime Moulding Co','prime@prime.com','7700881133','Ahmedabad','24EEEEL7890','active'),('Excel Polymers','excel@excel.com','9900771144','Surat','24FFFFM2345','pending')`)
    r.push('customers: 6')
    await pgPool.query(`INSERT INTO ${S}.quotations (quotation_no,customer_id,total_amount,status,valid_until) VALUES ('QT-2024-001','Rajesh Plastics Pvt Ltd',125000,'approved','2024-12-31'),('QT-2024-002','Deepak Industries',87500,'pending','2024-11-30'),('QT-2024-003','National Polymers',220000,'approved','2024-12-15'),('QT-2024-004','Surya Enterprises',45000,'draft','2024-12-20'),('QT-2024-005','Prime Moulding Co',310000,'pending','2024-11-25')`)
    r.push('quotations: 5')
    await pgPool.query(`INSERT INTO ${S}.sales_orders (order_no,customer_id,total_amount,status,delivery_date) VALUES ('SO-2024-001','Rajesh Plastics Pvt Ltd',125000,'processing','2024-12-05'),('SO-2024-002','National Polymers',220000,'processing','2024-12-10'),('SO-2024-003','Deepak Industries',67000,'delivered','2024-11-20'),('SO-2024-004','Surya Enterprises',95000,'pending','2024-12-15'),('SO-2024-005','Prime Moulding Co',180000,'approved','2024-12-20')`)
    r.push('sales_orders: 5')
    await pgPool.query(`INSERT INTO ${S}.inventory_items (name,sku,category,quantity,unit,reorder_level,unit_cost) VALUES ('HDPE Granules','RAW-HDPE-001','Raw Material',2500,'kg',500,95),('LDPE Resin','RAW-LDPE-002','Raw Material',1800,'kg',400,88),('PP Granules','RAW-PP-003','Raw Material',3200,'kg',600,72),('Color Master Batch','RAW-CMB-004','Additive',450,'kg',100,210),('Anti-UV Additive','ADD-UV-005','Additive',120,'kg',30,185),('Plastic Bags 500ml','FG-PB-001','Finished Good',8500,'pcs',1000,4.5),('Container 5L','FG-CT-002','Finished Good',3200,'pcs',500,38),('Pipe 1 inch 6m','FG-PP-003','Finished Good',750,'pcs',200,125)`)
    r.push('inventory_items: 8')
    await pgPool.query(`INSERT INTO ${S}.stock_movements (item_id,type,quantity,reference,notes) VALUES ('HDPE Granules','IN',1000,'PO-2024-005','Purchase receipt'),('HDPE Granules','OUT',350,'PRD-001','Production use'),('PP Granules','IN',2000,'PO-2024-006','Purchase receipt'),('Color Master Batch','OUT',50,'PRD-001','Production use'),('Plastic Bags 500ml','IN',5000,'PRD-002','Production output'),('Container 5L','IN',1200,'PRD-003','Production output'),('LDPE Resin','OUT',200,'PRD-004','Production use')`)
    r.push('stock_movements: 7')
    await pgPool.query(`INSERT INTO ${S}.bom (product_name,component,quantity,unit) VALUES ('Plastic Bag 500ml','LDPE Resin',0.025,'kg'),('Plastic Bag 500ml','Color Master Batch',0.001,'kg'),('Container 5L','HDPE Granules',0.18,'kg'),('Container 5L','Anti-UV Additive',0.005,'kg'),('Pipe 1 inch 6m','HDPE Granules',0.95,'kg'),('Pipe 1 inch 6m','Anti-UV Additive',0.02,'kg')`)
    r.push('bom: 6')
    await pgPool.query(`INSERT INTO ${S}.production_orders (order_no,product_name,quantity,status,planned_date,machine) VALUES ('PRD-2024-001','Plastic Bag 500ml',10000,'completed','2024-11-15','Machine A'),('PRD-2024-002','Container 5L',1500,'completed','2024-11-20','Machine B'),('PRD-2024-003','Pipe 1 inch 6m',500,'in_progress','2024-11-30','Machine C'),('PRD-2024-004','Plastic Bag 500ml',15000,'pending','2024-12-05','Machine A'),('PRD-2024-005','Container 5L',2000,'pending','2024-12-10','Machine B')`)
    r.push('production_orders: 5')
    await pgPool.query(`INSERT INTO ${S}.suppliers (name,contact_person,email,phone,city,status) VALUES ('Reliance Polymers Ltd','Mr Sharma','sharma@reliance.com','9876500001','Mumbai','active'),('GAIL Plastics Division','Mr Patel','patel@gail.com','9876500002','Delhi','active'),('IndoRama Synthetics','Ms Gupta','gupta@indorama.com','9876500003','Chennai','active'),('Haldia Petrochemicals','Mr Kumar','kumar@haldia.com','9876500004','Kolkata','active'),('Supreme Industries Supply','Ms Joshi','joshi@supreme.com','9876500005','Pune','active')`)
    r.push('suppliers: 5')
    await pgPool.query(`INSERT INTO ${S}.purchase_orders (po_no,supplier_id,total_amount,status,order_date,delivery_date) VALUES ('PO-2024-001','Reliance Polymers Ltd',95000,'delivered','2024-10-01','2024-10-15'),('PO-2024-002','GAIL Plastics Division',142000,'delivered','2024-10-10','2024-10-25'),('PO-2024-003','IndoRama Synthetics',78000,'approved','2024-11-01','2024-11-20'),('PO-2024-004','Haldia Petrochemicals',220000,'pending','2024-11-15','2024-12-05'),('PO-2024-005','Supreme Industries Supply',55000,'processing','2024-11-20','2024-12-10')`)
    r.push('purchase_orders: 5')
    await pgPool.query(`INSERT INTO ${S}.vehicles (registration_no,type,driver_name,driver_phone,status) VALUES ('MH-04-AB-1234','Mini Truck','Raju Jadhav','9800012345','active'),('MH-04-CD-5678','Tempo','Santosh More','9800067890','active'),('GJ-01-EF-9012','Heavy Truck','Mahesh Patel','9800023456','active'),('MH-12-GH-3456','Mini Truck','Suresh Yadav','9800034567','inactive')`)
    r.push('vehicles: 4')
    await pgPool.query(`INSERT INTO ${S}.vehicle_logs (vehicle_id,driver,start_km,end_km,purpose,log_date,fuel_expense) VALUES ('MH-04-AB-1234','Raju Jadhav',45200,45285,'Delivery to Rajesh Plastics Mumbai','2024-11-20',850),('MH-04-CD-5678','Santosh More',23100,23178,'Raw Material Pickup from Reliance','2024-11-21',720),('GJ-01-EF-9012','Mahesh Patel',78500,78620,'Delivery to National Polymers Delhi','2024-11-22',1200),('MH-04-AB-1234','Raju Jadhav',45285,45340,'Delivery to Deepak Industries Pune','2024-11-23',520),('MH-04-CD-5678','Santosh More',23178,23245,'Customer Visit Ahmedabad','2024-11-24',650)`)
    r.push('vehicle_logs: 5')
    await pgPool.query(`INSERT INTO ${S}.dispatch_orders (dispatch_no,sales_order_id,vehicle_id,status,dispatch_date,delivery_date) VALUES ('DSP-2024-001','SO-2024-003','MH-04-AB-1234','delivered','2024-11-18','2024-11-20'),('DSP-2024-002','SO-2024-001','GJ-01-EF-9012','in_progress','2024-11-25','2024-12-02'),('DSP-2024-003','SO-2024-002','MH-04-CD-5678','pending','2024-12-01','2024-12-05'),('DSP-2024-004','SO-2024-004','MH-04-AB-1234','pending','2024-12-08','2024-12-12')`)
    r.push('dispatch_orders: 4')
    await pgPool.query(`INSERT INTO ${S}.expenses (title,category,amount,status,expense_date,approved_by) VALUES ('Vehicle Fuel - November','Transport',12450,'approved','2024-11-30','Manager'),('Machine Maintenance','Maintenance',35000,'approved','2024-11-15','Director'),('Office Supplies','Administrative',3200,'paid','2024-11-20','Manager'),('Sales Team Travel','Travel',8500,'pending','2024-11-28',NULL),('Electricity Bill November','Utilities',42000,'approved','2024-11-30','Accounts'),('Packaging Materials','Production',18000,'paid','2024-11-10','Manager'),('Marketing Campaign','Marketing',25000,'pending','2024-11-25',NULL)`)
    r.push('expenses: 7')
    await pgPool.query(`INSERT INTO ${S}.employees (name,email,department,role,joining_date,status) VALUES ('Amit Sharma','amit.sharma@colorplas.com','Management','Director','2015-01-01','active'),('Priya Patel','priya.patel@colorplas.com','Sales','Sales Manager','2018-03-15','active'),('Rahul Kumar','rahul.kumar@colorplas.com','Production','Production Head','2016-06-01','active'),('Sunita Joshi','sunita.joshi@colorplas.com','Accounts','Accountant','2019-08-20','active'),('Deepak Verma','deepak.verma@colorplas.com','Inventory','Store Manager','2017-11-10','active'),('Meera Singh','meera.singh@colorplas.com','Dispatch','Dispatch Executive','2020-02-14','active'),('Vijay Yadav','vijay.yadav@colorplas.com','Production','Machine Operator','2021-05-01','active'),('Pooja Desai','pooja.desai@colorplas.com','Sales','Sales Executive','2022-07-01','active')`)
    r.push('employees: 8')
    return NextResponse.json({ success: true, seeded: r })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
