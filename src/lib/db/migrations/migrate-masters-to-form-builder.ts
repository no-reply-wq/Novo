/**
 * Migrates the 6 built-in Masters (Payment Terms, Categories, UoM,
 * Clients, Vendors, Products) into real Form Builder forms marked as
 * Master Data - same safe, additive pattern as
 * migrate-leads-quotations-to-form-builder.ts:
 *   - Reuses the exact same ids, so any existing FK value (quotations
 *     referencing a client, products referencing a category, purchase
 *     orders referencing a vendor, etc.) still resolves correctly once
 *     other code is updated to look in form_submissions
 *   - Does NOT touch or drop the original clients/vendors/products/
 *     product_categories/uoms/payment_terms tables or their constraints
 *
 * Order matters here more than it did for Leads/Quotations: Payment
 * Terms, Categories, and UoM must be migrated before Clients/Vendors/
 * Products, since those reference them by id.
 *
 * NOTE: not run against a live database - reasoned through carefully
 * against the real schema, but needs testing on a staging copy of
 * real tenant data first.
 */

import { tenantQuery, withTenantTransaction } from '../client';
import { v4 as uuid } from 'uuid';

interface FieldSpec {
  key: string;
  label: string;
  field_type: string;
  is_required?: boolean;
  dropdown_type?: 'static' | 'dynamic';
  dropdown_static_options?: Array<{ value: string; label: string }>;
  dropdown_source_table?: string;
  dropdown_value_column?: string;
  dropdown_label_column?: string;
  sort_order: number;
}

async function createMasterForm(
  schemaName: string,
  opts: { name: string; slug: string; tabLabel: string },
  fields: FieldSpec[]
): Promise<string> {
  const formId = uuid();
  await tenantQuery(
    schemaName,
    `INSERT INTO form_configs (
       id, name, slug, show_as_tab, tab_label, table_columns, is_master, active
     ) VALUES ($1,$2,$3,true,$4,$5,true,true)`,
    [formId, opts.name, opts.slug, opts.tabLabel, JSON.stringify(fields.slice(0, 6).map((f) => ({ key: f.key, label: f.label, type: f.field_type })))]
  );

  for (const f of fields) {
    await tenantQuery(
      schemaName,
      `INSERT INTO form_fields (
         id, form_id, key, label, field_type, is_required,
         dropdown_type, dropdown_static_options, dropdown_source_table,
         dropdown_value_column, dropdown_label_column, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        uuid(), formId, f.key, f.label, f.field_type, f.is_required ?? false,
        f.dropdown_type ?? null, f.dropdown_static_options ? JSON.stringify(f.dropdown_static_options) : '[]',
        f.dropdown_source_table ?? null, f.dropdown_value_column ?? null, f.dropdown_label_column ?? null,
        f.sort_order,
      ]
    );
  }
  return formId;
}

async function migrateRows(
  schemaName: string,
  formId: string,
  rows: Array<{ id: string; header_data: Record<string, unknown> }>
): Promise<number> {
  let migrated = 0;
  for (const row of rows) {
    await withTenantTransaction(schemaName, async (client) => {
      await client.query(
        `INSERT INTO form_submissions (id, form_id, header_data, thread_id, revision_number, is_latest)
         VALUES ($1, $2, $3, $1, 1, true) ON CONFLICT (id) DO NOTHING`,
        [row.id, formId, JSON.stringify(row.header_data)]
      );
    });
    migrated++;
  }
  return migrated;
}

export async function migratePaymentTerms(schemaName: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Payment Terms', slug: 'payment-terms-migrated', tabLabel: 'Payment Terms' },
    [
      { key: 'name', label: 'Name', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'days', label: 'Days', field_type: 'number', sort_order: 1 },
      { key: 'description', label: 'Description', field_type: 'textarea', sort_order: 2 },
    ]
  );
  const rows = await tenantQuery<{ id: string; name: string; days: number; description: string }>(schemaName, `SELECT * FROM payment_terms`);
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({ id: r.id, header_data: { name: r.name, days: r.days, description: r.description } })));
  return { formId, migrated };
}

export async function migrateCategories(schemaName: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Product Categories', slug: 'categories-migrated', tabLabel: 'Categories' },
    [
      { key: 'name', label: 'Name', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'parent_name', label: 'Parent Category', field_type: 'text', sort_order: 1 },
    ]
  );
  const rows = await tenantQuery<{ id: string; name: string; parent_name: string }>(
    schemaName,
    `SELECT c.id, c.name, p.name as parent_name FROM product_categories c LEFT JOIN product_categories p ON p.id = c.parent_id`
  );
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({ id: r.id, header_data: { name: r.name, parent_name: r.parent_name } })));
  return { formId, migrated };
}

export async function migrateUoms(schemaName: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Units of Measure', slug: 'uoms-migrated', tabLabel: 'Units of Measure' },
    [
      { key: 'name', label: 'Name', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'abbreviation', label: 'Abbreviation', field_type: 'text', sort_order: 1 },
    ]
  );
  const rows = await tenantQuery<{ id: string; name: string; abbreviation: string }>(schemaName, `SELECT * FROM uoms`);
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({ id: r.id, header_data: { name: r.name, abbreviation: r.abbreviation } })));
  return { formId, migrated };
}

export async function migrateClients(schemaName: string, paymentTermsFormId: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Clients', slug: 'clients-migrated', tabLabel: 'Clients' },
    [
      { key: 'company', label: 'Company', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'contact_name', label: 'Contact', field_type: 'text', sort_order: 1 },
      { key: 'email', label: 'Email', field_type: 'text', sort_order: 2 },
      { key: 'phone', label: 'Phone', field_type: 'text', sort_order: 3 },
      { key: 'address', label: 'Address', field_type: 'textarea', sort_order: 4 },
      { key: 'gst_number', label: 'GST Number', field_type: 'text', sort_order: 5 },
      { key: 'pan_number', label: 'PAN Number', field_type: 'text', sort_order: 6 },
      { key: 'payment_term_name', label: 'Payment Term', field_type: 'dropdown', sort_order: 7,
        dropdown_type: 'dynamic', dropdown_source_table: `form:${paymentTermsFormId}`, dropdown_value_column: 'name', dropdown_label_column: 'name' },
    ]
  );
  const rows = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT c.*, pt.name as payment_term_name FROM clients c LEFT JOIN payment_terms pt ON pt.id = c.payment_term_id`
  );
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({
    id: r.id as string,
    header_data: {
      company: r.company, contact_name: r.contact_name, email: r.email, phone: r.phone,
      address: r.address, gst_number: r.gst_number, pan_number: r.pan_number, payment_term_name: r.payment_term_name,
    },
  })));
  return { formId, migrated };
}

export async function migrateVendors(schemaName: string, paymentTermsFormId: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Vendors', slug: 'vendors-migrated', tabLabel: 'Vendors' },
    [
      { key: 'company', label: 'Company', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'contact_name', label: 'Contact', field_type: 'text', sort_order: 1 },
      { key: 'email', label: 'Email', field_type: 'text', sort_order: 2 },
      { key: 'phone', label: 'Phone', field_type: 'text', sort_order: 3 },
      { key: 'address', label: 'Address', field_type: 'textarea', sort_order: 4 },
      { key: 'gst_number', label: 'GST Number', field_type: 'text', sort_order: 5 },
      { key: 'pan_number', label: 'PAN Number', field_type: 'text', sort_order: 6 },
      { key: 'payment_term_name', label: 'Payment Term', field_type: 'dropdown', sort_order: 7,
        dropdown_type: 'dynamic', dropdown_source_table: `form:${paymentTermsFormId}`, dropdown_value_column: 'name', dropdown_label_column: 'name' },
      { key: 'bank_name', label: 'Bank Name', field_type: 'text', sort_order: 8 },
      { key: 'bank_account', label: 'Bank Account', field_type: 'text', sort_order: 9 },
      { key: 'bank_ifsc', label: 'Bank IFSC', field_type: 'text', sort_order: 10 },
    ]
  );
  const rows = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT v.*, pt.name as payment_term_name FROM vendors v LEFT JOIN payment_terms pt ON pt.id = v.payment_term_id`
  );
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({
    id: r.id as string,
    header_data: {
      company: r.company, contact_name: r.contact_name, email: r.email, phone: r.phone,
      address: r.address, gst_number: r.gst_number, pan_number: r.pan_number, payment_term_name: r.payment_term_name,
      bank_name: r.bank_name, bank_account: r.bank_account, bank_ifsc: r.bank_ifsc,
    },
  })));
  return { formId, migrated };
}

export async function migrateProducts(schemaName: string, categoriesFormId: string, uomsFormId: string) {
  const formId = await createMasterForm(
    schemaName,
    { name: 'Products', slug: 'products-migrated', tabLabel: 'Products' },
    [
      { key: 'name', label: 'Name', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'sku', label: 'SKU', field_type: 'text', sort_order: 1 },
      { key: 'description', label: 'Description', field_type: 'textarea', sort_order: 2 },
      { key: 'category_name', label: 'Category', field_type: 'dropdown', sort_order: 3,
        dropdown_type: 'dynamic', dropdown_source_table: `form:${categoriesFormId}`, dropdown_value_column: 'name', dropdown_label_column: 'name' },
      { key: 'uom_name', label: 'Unit of Measure', field_type: 'dropdown', sort_order: 4,
        dropdown_type: 'dynamic', dropdown_source_table: `form:${uomsFormId}`, dropdown_value_column: 'name', dropdown_label_column: 'name' },
      { key: 'type', label: 'Type', field_type: 'dropdown', sort_order: 5,
        dropdown_type: 'static', dropdown_static_options: ['product', 'raw_material', 'finished_good', 'service'].map((s) => ({ value: s, label: s })) },
      { key: 'unit_cost', label: 'Unit Cost', field_type: 'number', sort_order: 6 },
      { key: 'unit_price', label: 'Unit Price', field_type: 'number', sort_order: 7 },
      { key: 'reorder_point', label: 'Reorder Point', field_type: 'number', sort_order: 8 },
    ]
  );
  const rows = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT p.*, pc.name as category_name, u.name as uom_name
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     LEFT JOIN uoms u ON u.id = p.uom_id
     WHERE p.active = true`
  );
  const migrated = await migrateRows(schemaName, formId, rows.rows.map((r) => ({
    id: r.id as string,
    header_data: {
      name: r.name, sku: r.sku, description: r.description, category_name: r.category_name,
      uom_name: r.uom_name, type: r.type, unit_cost: r.unit_cost, unit_price: r.unit_price, reorder_point: r.reorder_point,
    },
  })));
  return { formId, migrated };
}

/** Runs all 6 in the correct dependency order. */
export async function migrateAllMasters(schemaName: string) {
  const paymentTerms = await migratePaymentTerms(schemaName);
  const categories = await migrateCategories(schemaName);
  const uoms = await migrateUoms(schemaName);
  const clients = await migrateClients(schemaName, paymentTerms.formId);
  const vendors = await migrateVendors(schemaName, paymentTerms.formId);
  const products = await migrateProducts(schemaName, categories.formId, uoms.formId);
  return { paymentTerms, categories, uoms, clients, vendors, products };
}
