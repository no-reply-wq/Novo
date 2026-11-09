-- Colorplas ERP - Correct Seed Script
-- Run: psql postgresql://aniketpattanayak@localhost:5432/novo -f /Users/aniketpattanayak/Desktop/OMM_SYS/Novo-main/seed-colorplas.sql

-- CUSTOMERS
-- cols: name, contact_person, phone, email, city, gst_number, credit_limit, status
INSERT INTO tenant_colorplas.ct_customers (name, contact_person, phone, email, city, gst_number, credit_limit, status)
VALUES
  ('Reliance Polymers Ltd', 'Rajesh Shah', '9876543210', 'rajesh@reliancepolymers.com', 'Mumbai', '27AABCR1234A1Z5', 500000, 'Active'),
  ('Tata Chemicals', 'Priya Nair', '9123456780', 'priya@tatachemicals.com', 'Pune', '27AABCT5678B2Z6', 1000000, 'Active'),
  ('Godrej Industries', 'Amit Verma', '9988776655', 'amit@godrej.com', 'Mumbai', '27AABCG9012C3Z7', 750000, 'Active'),
  ('Birla Corporation', 'Suresh Kumar', '8877665544', 'suresh@birlacorp.com', 'Kolkata', '19AABCB3456D4Z8', 250000, 'Active'),
  ('Ashok Plastics', 'Ramesh Patel', '7766554433', 'ramesh@ashokplastics.com', 'Ahmedabad', '24AABCA7890E5Z9', 300000, 'Active'),
  ('Nova Synthetics', 'Dinesh Mehta', '9871234567', 'dinesh@novasynthetics.com', 'Surat', '24AABCN1111F1Z1', 450000, 'Active'),
  ('Supreme Polymers', 'Kavita Joshi', '8761234567', 'kavita@supremepolymers.com', 'Chennai', '33AABCS2222G2Z2', 600000, 'Active')
ON CONFLICT DO NOTHING;

-- LEADS
-- cols: title, company, contact_name, phone, email, source, stage, estimated_value, notes
INSERT INTO tenant_colorplas.ct_leads (title, company, contact_name, phone, email, source, stage, estimated_value, notes)
VALUES
  ('HDPE Granules Inquiry', 'Sunrise Polymers', 'Vikram Mehta', '9871234560', 'vikram@sunrisepolymers.com', 'Trade Show', 'New', 150000, 'Met at Plastivision 2026'),
  ('PP Compound Requirement', 'Modern Plastics', 'Anita Desai', '8765432190', 'anita@modernplastics.com', 'Website', 'Contacted', 200000, 'Interested in PP Black compound'),
  ('ABS Granules Sample', 'Pushpa Industries', 'Mohit Sharma', '7654321890', 'mohit@pushpa.com', 'Referral', 'Qualified', 350000, 'Referred by Tata Chemicals'),
  ('PVC Compound Bulk Order', 'Nova Composites', 'Deepa Joshi', '6543218790', 'deepa@novacomposites.com', 'Cold Call', 'New', 180000, 'Looking for PVC rigid compound'),
  ('Masterbatch Supply', 'Excel Polymers', 'Ravi Kapoor', '5432187890', 'ravi@excelpolymers.com', 'LinkedIn', 'Negotiation', 90000, 'Price negotiation in progress')
ON CONFLICT DO NOTHING;

-- PRODUCTS
-- cols: name, sku, category, unit, selling_price, cost_price, reorder_level, description
INSERT INTO tenant_colorplas.ct_products (name, sku, category, unit, selling_price, cost_price, reorder_level, description)
VALUES
  ('HDPE Natural Granules', 'HDPE-NAT-001', 'Granules', 'KG', 95.00, 78.00, 500, 'High Density Polyethylene natural granules'),
  ('PP Black Compound', 'PP-BLK-001', 'Compound', 'KG', 110.00, 88.00, 400, 'Polypropylene black compound for moulding'),
  ('ABS Grey Granules', 'ABS-GRY-001', 'Granules', 'KG', 185.00, 155.00, 200, 'Acrylonitrile Butadiene Styrene grey granules'),
  ('PVC Rigid Compound', 'PVC-RGD-001', 'Compound', 'KG', 75.00, 60.00, 500, 'PVC rigid compound for pipes'),
  ('LDPE Film Grade', 'LDPE-FLM-001', 'Granules', 'KG', 88.00, 72.00, 300, 'Low Density PE film grade granules'),
  ('Masterbatch Black', 'MB-BLK-001', 'Masterbatch', 'KG', 65.00, 50.00, 100, 'Carbon black masterbatch 40%'),
  ('Masterbatch White', 'MB-WHT-001', 'Masterbatch', 'KG', 70.00, 55.00, 100, 'Titanium dioxide white masterbatch'),
  ('Nylon 66 Granules', 'NY66-001', 'Granules', 'KG', 320.00, 270.00, 50, 'Polyamide Nylon 66 granules')
ON CONFLICT DO NOTHING;

-- SUPPLIERS
-- cols: name, contact_person, phone, email, city, gst_number, material_type, payment_terms, status
INSERT INTO tenant_colorplas.ct_suppliers (name, contact_person, phone, email, city, gst_number, material_type, payment_terms, status)
VALUES
  ('GAIL Polymers', 'Dinesh Thakur', '9876012345', 'dinesh@gailpolymers.com', 'Noida', '09AABCG1111A1Z1', 'Raw Material', 'Net 30', 'Active'),
  ('Haldia Petrochemicals', 'Santosh Roy', '8765901234', 'santosh@haldia.com', 'Haldia', '19AABCH2222B2Z2', 'Raw Material', 'Net 45', 'Active'),
  ('Indian Oil Corporation', 'Prakash Singh', '7654890123', 'prakash@ioc.com', 'Delhi', '07AABCI3333C3Z3', 'Raw Material', 'Net 60', 'Active'),
  ('Chemplast Sanmar', 'Venkatesan M', '6543789012', 'venkatesan@chemplast.com', 'Chennai', '33AABCC4444D4Z4', 'Raw Material', 'Net 30', 'Active'),
  ('Packaging Solutions Ltd', 'Rahul Gupta', '5432678901', 'rahul@packagingsol.com', 'Ahmedabad', '24AABCP5555E5Z5', 'Packaging', 'Net 15', 'Active')
ON CONFLICT DO NOTHING;

-- INVENTORY
-- cols: product_name, location, quantity, unit, last_updated, value
INSERT INTO tenant_colorplas.ct_inventory (product_name, location, quantity, unit, last_updated, value)
VALUES
  ('HDPE Natural Granules', 'Main Warehouse', 5000, 'KG', NOW(), 390000),
  ('PP Black Compound', 'Main Warehouse', 3200, 'KG', NOW(), 281600),
  ('ABS Grey Granules', 'Main Warehouse', 1500, 'KG', NOW(), 232500),
  ('PVC Rigid Compound', 'Main Warehouse', 4800, 'KG', NOW(), 288000),
  ('LDPE Film Grade', 'Main Warehouse', 2100, 'KG', NOW(), 151200),
  ('Masterbatch Black', 'Raw Store', 800, 'KG', NOW(), 40000),
  ('Masterbatch White', 'Raw Store', 600, 'KG', NOW(), 33000),
  ('Nylon 66 Granules', 'Raw Store', 400, 'KG', NOW(), 108000)
ON CONFLICT DO NOTHING;

-- EXPENSE CATEGORIES
-- cols: name, budget, description
INSERT INTO tenant_colorplas.ct_expense_categories (name, budget, description)
VALUES
  ('Raw Materials', 2000000, 'Purchase of raw polymer materials'),
  ('Utilities', 150000, 'Electricity, water, gas for factory'),
  ('Logistics', 100000, 'Transport and freight charges'),
  ('Maintenance', 80000, 'Machine and equipment maintenance'),
  ('Admin', 50000, 'Office and administrative expenses'),
  ('Salaries', 500000, 'Staff salaries and wages'),
  ('Marketing', 30000, 'Sales and marketing expenses')
ON CONFLICT DO NOTHING;

-- EMPLOYEES
-- cols: name, employee_id, department, designation, phone, email, join_date, salary, status
INSERT INTO tenant_colorplas.ct_employees (name, employee_id, department, designation, phone, email, join_date, salary, status)
VALUES
  ('Aniket Pattanayak', 'EMP001', 'Management', 'Director', '9876543210', 'aniket@colorplas.com', '2020-01-01', 150000, 'Active'),
  ('Sunil Verma', 'EMP002', 'Production', 'Production Manager', '8765432100', 'sunil@colorplas.com', '2021-03-15', 65000, 'Active'),
  ('Meena Sharma', 'EMP003', 'Sales', 'Sales Executive', '7654321000', 'meena@colorplas.com', '2022-06-01', 45000, 'Active'),
  ('Rajiv Nair', 'EMP004', 'Quality', 'QC Inspector', '6543210000', 'rajiv@colorplas.com', '2021-09-10', 38000, 'Active'),
  ('Preethi Iyer', 'EMP005', 'Accounts', 'Accountant', '5432100000', 'preethi@colorplas.com', '2020-11-20', 42000, 'Active'),
  ('Arun Pillai', 'EMP006', 'Dispatch', 'Dispatch Officer', '9123456780', 'arun@colorplas.com', '2023-01-05', 32000, 'Active'),
  ('Kavya Singh', 'EMP007', 'Admin', 'Admin Assistant', '8012345670', 'kavya@colorplas.com', '2023-07-15', 25000, 'Active')
ON CONFLICT DO NOTHING;

-- VEHICLES
-- cols: vehicle_number, type, owner, driver_name, driver_phone, capacity_tons, insurance_expiry, fitness_expiry, status
INSERT INTO tenant_colorplas.ct_vehicles (vehicle_number, type, owner, driver_name, driver_phone, capacity_tons, insurance_expiry, fitness_expiry, status)
VALUES
  ('MH-12-AB-1234', 'Truck', 'Colorplas', 'Ramesh Yadav', '9988123456', 7.0, '2027-03-31', '2027-06-30', 'Active'),
  ('MH-12-CD-5678', 'Mini Truck', 'Colorplas', 'Suresh Kamble', '8877234567', 1.5, '2027-05-31', '2027-08-31', 'Active'),
  ('MH-12-EF-9012', 'Tempo', 'Colorplas', 'Dinesh Patil', '7766345678', 2.5, '2026-12-31', '2027-01-31', 'Active')
ON CONFLICT DO NOTHING;

-- PURCHASE ORDERS
-- cols: po_number, supplier_name, po_date, expected_delivery, total_amount, status, payment_status
INSERT INTO tenant_colorplas.ct_purchase_orders (po_number, supplier_name, po_date, expected_delivery, total_amount, status, payment_status)
VALUES
  ('PO-2026-001', 'GAIL Polymers', '2026-11-01', '2026-11-10', 475000, 'Received', 'Paid'),
  ('PO-2026-002', 'Haldia Petrochemicals', '2026-11-03', '2026-11-15', 330000, 'Ordered', 'Pending'),
  ('PO-2026-003', 'Indian Oil Corporation', '2026-11-06', '2026-11-20', 264000, 'Pending', 'Pending'),
  ('PO-2026-004', 'Chemplast Sanmar', '2026-11-07', '2026-11-18', 180000, 'Ordered', 'Pending')
ON CONFLICT DO NOTHING;

-- SALES ORDERS
-- cols: order_number, customer_name, order_date, delivery_date, total_amount, status, payment_status
INSERT INTO tenant_colorplas.ct_sales_orders (order_number, customer_name, order_date, delivery_date, total_amount, status, payment_status)
VALUES
  ('SO-2026-001', 'Reliance Polymers Ltd', '2026-11-01', '2026-11-10', 190000, 'Delivered', 'Paid'),
  ('SO-2026-002', 'Godrej Industries', '2026-11-03', '2026-11-15', 165000, 'Processing', 'Pending'),
  ('SO-2026-003', 'Tata Chemicals', '2026-11-05', '2026-11-20', 92500, 'Pending', 'Pending'),
  ('SO-2026-004', 'Birla Corporation', '2026-11-07', '2026-11-25', 75000, 'Confirmed', 'Pending'),
  ('SO-2026-005', 'Ashok Plastics', '2026-11-08', '2026-11-22', 44000, 'Pending', 'Pending')
ON CONFLICT DO NOTHING;

-- QUOTATIONS
-- cols: quote_number, customer_name, quote_date, valid_until, total_amount, status, notes
INSERT INTO tenant_colorplas.ct_quotations (quote_number, customer_name, quote_date, valid_until, total_amount, status, notes)
VALUES
  ('QT-2026-001', 'Nova Synthetics', '2026-11-01', '2026-11-30', 285000, 'Sent', 'HDPE 3000kg quote'),
  ('QT-2026-002', 'Supreme Polymers', '2026-11-03', '2026-11-30', 110000, 'Draft', 'PP Compound quote'),
  ('QT-2026-003', 'Excel Polymers', '2026-11-05', '2026-12-05', 92000, 'Accepted', 'Masterbatch supply quote'),
  ('QT-2026-004', 'Sunrise Polymers', '2026-11-07', '2026-12-07', 47500, 'Sent', 'Sample order quote')
ON CONFLICT DO NOTHING;

-- DISPATCH ORDERS
-- cols: dispatch_number, customer_name, sales_order_ref, dispatch_date, vehicle_number, driver_name, quantity, weight_kg, status, delivery_address
INSERT INTO tenant_colorplas.ct_dispatch_orders (dispatch_number, customer_name, sales_order_ref, dispatch_date, vehicle_number, driver_name, quantity, weight_kg, status, delivery_address)
VALUES
  ('DSP-2026-001', 'Reliance Polymers Ltd', 'SO-2026-001', '2026-11-10', 'MH-12-AB-1234', 'Ramesh Yadav', 2000, 2000, 'Delivered', 'Plot 45, MIDC Turbhe, Mumbai'),
  ('DSP-2026-002', 'Godrej Industries', 'SO-2026-002', '2026-11-15', 'MH-12-CD-5678', 'Suresh Kamble', 1500, 1500, 'In Transit', 'Godrej One, Pirojshanagar, Mumbai')
ON CONFLICT DO NOTHING;

-- EXPENSES
-- cols: title, category, date, paid_by, payment_method, status, notes
INSERT INTO tenant_colorplas.ct_expenses (title, category, date, paid_by, payment_method, status, notes)
VALUES
  ('November Electricity Bill', 'Utilities', '2026-11-01', 'Preethi Iyer', 'Bank Transfer', 'Approved', 'MSEB bill Rs 48500'),
  ('Freight - Reliance Delivery', 'Logistics', '2026-11-02', 'Arun Pillai', 'Cash', 'Approved', 'Transport to Mumbai Rs 12000'),
  ('Extruder Machine Service', 'Maintenance', '2026-11-03', 'Sunil Verma', 'Cheque', 'Approved', 'ABC Engineers Rs 25000'),
  ('Office Stationery', 'Admin', '2026-11-05', 'Kavya Singh', 'Cash', 'Approved', 'Monthly stationery Rs 3500'),
  ('Trade Show Registration', 'Marketing', '2026-11-07', 'Aniket Pattanayak', 'Bank Transfer', 'Approved', 'Plastivision 2026 Rs 15000'),
  ('Fuel Reimbursement Nov W1', 'Logistics', '2026-11-08', 'Arun Pillai', 'Cash', 'Pending', 'Vehicle fuel Rs 8500')
ON CONFLICT DO NOTHING;

-- VEHICLE LOGS
-- cols: vehicle_number, trip_from, trip_to, km_start, km_end, fuel_liters, fuel_cost, purpose, driver_name
INSERT INTO tenant_colorplas.ct_vehicle_logs (vehicle_number, trip_from, trip_to, km_start, km_end, fuel_liters, fuel_cost, purpose, driver_name)
VALUES
  ('MH-12-AB-1234', 'Colorplas Factory Pune', 'Reliance Polymers Mumbai', 45200, 45350, 18, 2800, 'Delivery SO-2026-001', 'Ramesh Yadav'),
  ('MH-12-CD-5678', 'Colorplas Factory Pune', 'GAIL Polymers Noida', 32100, 32280, 22, 3200, 'Raw material pickup PO-2026-001', 'Suresh Kamble'),
  ('MH-12-EF-9012', 'Colorplas Factory Pune', 'Godrej Industries Mumbai', 18500, 18610, 12, 1500, 'Sample delivery', 'Dinesh Patil')
ON CONFLICT DO NOTHING;

-- STOCK MOVEMENTS
-- cols: product_name, type, quantity, date, reference, notes
INSERT INTO tenant_colorplas.ct_stock_movements (product_name, type, quantity, date, reference, notes)
VALUES
  ('HDPE Natural Granules', 'IN', 5000, '2026-11-01', 'PO-2026-001', 'Received from GAIL Polymers'),
  ('HDPE Natural Granules', 'OUT', 2000, '2026-11-10', 'SO-2026-001', 'Dispatched to Reliance Polymers'),
  ('PP Black Compound', 'IN', 3000, '2026-11-03', 'PO-2026-002', 'Received from Haldia Petrochemicals'),
  ('PP Black Compound', 'OUT', 1500, '2026-11-15', 'SO-2026-002', 'Dispatched to Godrej Industries'),
  ('Masterbatch Black', 'IN', 800, '2026-11-05', 'PO-2026-004', 'Received from Chemplast')
ON CONFLICT DO NOTHING;

-- PRODUCTION ORDERS (already has 3, adding more)
-- cols: order_number, product_name, quantity, unit, start_date, end_date, status, machine, notes
INSERT INTO tenant_colorplas.ct_production_orders (order_number, product_name, quantity, unit, start_date, end_date, status, machine, notes)
VALUES
  ('PRO-2026-004', 'PVC Rigid Compound', 2000, 'KG', '2026-11-15', '2026-11-17', 'Planned', 'Extruder-2', 'Batch for Birla order'),
  ('PRO-2026-005', 'LDPE Film Grade', 1000, 'KG', '2026-11-18', '2026-11-19', 'Planned', 'Extruder-1', 'Regular stock replenishment')
ON CONFLICT DO NOTHING;

-- BOM
-- cols: product_name, component, quantity, unit
INSERT INTO tenant_colorplas.ct_bom (product_name, component, quantity, unit)
VALUES
  ('PP Black Compound', 'PP Natural Resin', 0.95, 'KG'),
  ('PP Black Compound', 'Masterbatch Black', 0.05, 'KG'),
  ('PVC Rigid Compound', 'PVC Resin K67', 0.80, 'KG'),
  ('PVC Rigid Compound', 'Stabilizer', 0.08, 'KG'),
  ('PVC Rigid Compound', 'Plasticizer', 0.12, 'KG'),
  ('HDPE Natural Granules', 'HDPE Base Resin', 1.00, 'KG'),
  ('ABS Grey Granules', 'ABS Base Resin', 0.92, 'KG'),
  ('ABS Grey Granules', 'Masterbatch Grey', 0.08, 'KG')
ON CONFLICT DO NOTHING;

-- VERIFY
SELECT tbl, rows FROM (
  SELECT 'customers' as tbl, COUNT(*)::int as rows FROM tenant_colorplas.ct_customers
  UNION ALL SELECT 'leads', COUNT(*) FROM tenant_colorplas.ct_leads
  UNION ALL SELECT 'products', COUNT(*) FROM tenant_colorplas.ct_products
  UNION ALL SELECT 'suppliers', COUNT(*) FROM tenant_colorplas.ct_suppliers
  UNION ALL SELECT 'inventory', COUNT(*) FROM tenant_colorplas.ct_inventory
  UNION ALL SELECT 'expense_categories', COUNT(*) FROM tenant_colorplas.ct_expense_categories
  UNION ALL SELECT 'employees', COUNT(*) FROM tenant_colorplas.ct_employees
  UNION ALL SELECT 'vehicles', COUNT(*) FROM tenant_colorplas.ct_vehicles
  UNION ALL SELECT 'purchase_orders', COUNT(*) FROM tenant_colorplas.ct_purchase_orders
  UNION ALL SELECT 'sales_orders', COUNT(*) FROM tenant_colorplas.ct_sales_orders
  UNION ALL SELECT 'quotations', COUNT(*) FROM tenant_colorplas.ct_quotations
  UNION ALL SELECT 'dispatch_orders', COUNT(*) FROM tenant_colorplas.ct_dispatch_orders
  UNION ALL SELECT 'expenses', COUNT(*) FROM tenant_colorplas.ct_expenses
  UNION ALL SELECT 'vehicle_logs', COUNT(*) FROM tenant_colorplas.ct_vehicle_logs
  UNION ALL SELECT 'stock_movements', COUNT(*) FROM tenant_colorplas.ct_stock_movements
  UNION ALL SELECT 'production_orders', COUNT(*) FROM tenant_colorplas.ct_production_orders
  UNION ALL SELECT 'bom', COUNT(*) FROM tenant_colorplas.ct_bom
) t ORDER BY tbl;
