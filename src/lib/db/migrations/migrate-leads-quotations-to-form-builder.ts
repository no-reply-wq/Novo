/**
 * Migrates Leads and Quotations into the Form Builder system, using
 * the board-view and revisioning features built specifically to make
 * this possible without losing functionality.
 *
 * DELIBERATELY ADDITIVE AND NON-DESTRUCTIVE:
 *   - Copies data into form_configs / form_fields / form_submissions /
 *     form_submission_items
 *   - Reuses the EXACT SAME ids from leads/quotations when creating the
 *     corresponding form_submissions rows — this means anything that
 *     currently stores a lead_id or quotation_id (Sales Orders,
 *     Quotation Items, Lead Activity) still points at a value that
 *     will resolve correctly once that code is updated to look in
 *     form_submissions instead
 *   - Does NOT touch, drop, or stop populating the original leads /
 *     quotations / lead_items / quotation_items tables
 *   - Does NOT drop any foreign key constraint
 *
 * Column names here are matched against the REAL form_fields schema
 * (is_line_item, is_required, dropdown_value_column, etc.) — an
 * earlier draft of this file used plausible-sounding but wrong names
 * (section, required, dropdown_source_value_col) copied from a
 * similarly-wrong interface elsewhere in this codebase, which would
 * have failed immediately with "column does not exist" the moment
 * this actually ran. Fixed by reading tenant-schema.sql directly
 * rather than trusting a frontend type that turned out to be stale.
 *
 * dropdown_static_options is JSONB storing an array of
 * {value, label} objects — passed as a JSON-stringified array here,
 * which Postgres casts into JSONB automatically on insert.
 *
 * This has NOT been run against a live database. Test against a
 * staging copy of real tenant data before trusting it anywhere near
 * production.
 */

import { tenantQuery, withTenantTransaction } from '../client';
import { v4 as uuid } from 'uuid';

interface FieldSpec {
  key: string;
  label: string;
  field_type: string;
  is_line_item?: boolean;
  is_required?: boolean;
  is_row_number?: boolean;
  dropdown_type?: 'static' | 'dynamic';
  dropdown_static_options?: Array<{ value: string; label: string }>;
  sort_order: number;
}

async function createFormConfig(
  schemaName: string,
  opts: {
    name: string;
    slug: string;
    tabLabel: string;
    boardViewEnabled?: boolean;
    boardGroupByField?: string;
    revisioningEnabled?: boolean;
  },
  fields: FieldSpec[]
): Promise<string> {
  const formId = uuid();
  await tenantQuery(
    schemaName,
    `INSERT INTO form_configs (
       id, name, slug, show_as_tab, tab_label, table_columns,
       board_view_enabled, board_group_by_field, revisioning_enabled, active
     ) VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,true)`,
    [
      formId, opts.name, opts.slug, opts.tabLabel,
      JSON.stringify(fields.filter((f) => !f.is_line_item).slice(0, 6).map((f) => ({ key: f.key, label: f.label, type: f.field_type }))),
      opts.boardViewEnabled ?? false, opts.boardGroupByField ?? null, opts.revisioningEnabled ?? false,
    ]
  );

  for (const f of fields) {
    await tenantQuery(
      schemaName,
      `INSERT INTO form_fields (
         id, form_id, key, label, field_type, is_line_item, is_required, is_row_number,
         dropdown_type, dropdown_static_options, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuid(), formId, f.key, f.label, f.field_type,
        f.is_line_item ?? false, f.is_required ?? false, f.is_row_number ?? false,
        f.dropdown_type ?? null, f.dropdown_static_options ? JSON.stringify(f.dropdown_static_options) : '[]',
        f.sort_order,
      ]
    );
  }

  return formId;
}

export async function migrateLeads(schemaName: string): Promise<{ formId: string; migrated: number }> {
  const stages = await tenantQuery<{ name: string }>(
    schemaName,
    `SELECT name FROM lead_stages ORDER BY sort_order ASC`
  );
  const stageOptions = stages.rows.map((r) => ({ value: r.name, label: r.name }));

  const formId = await createFormConfig(
    schemaName,
    {
      name: 'Leads', slug: 'leads-migrated', tabLabel: 'Leads',
      boardViewEnabled: true, boardGroupByField: 'stage',
    },
    [
      { key: 'title', label: 'Title', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'client_name', label: 'Client', field_type: 'text', sort_order: 1 },
      { key: 'contact_name', label: 'Contact', field_type: 'text', sort_order: 2 },
      { key: 'email', label: 'Email', field_type: 'text', sort_order: 3 },
      { key: 'phone', label: 'Phone', field_type: 'text', sort_order: 4 },
      {
        key: 'stage', label: 'Stage', field_type: 'dropdown', sort_order: 5,
        dropdown_type: 'static', dropdown_static_options: stageOptions,
      },
      { key: 'expected_value', label: 'Expected Value', field_type: 'number', sort_order: 6 },
      { key: 'probability', label: 'Probability %', field_type: 'number', sort_order: 7 },
      { key: 'expected_close', label: 'Expected Close', field_type: 'date', sort_order: 8 },
      { key: 'assigned_to_name', label: 'Assigned To', field_type: 'text', sort_order: 9 },
      { key: 'source', label: 'Source', field_type: 'text', sort_order: 10 },
      { key: 'notes', label: 'Notes', field_type: 'textarea', sort_order: 11 },
    ]
  );

  const leads = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT l.*, ls.name as stage_name, c.name as client_name, u.name as assigned_to_name
     FROM leads l
     LEFT JOIN lead_stages ls ON ls.id = l.stage_id
     LEFT JOIN clients c ON c.id = l.client_id
     LEFT JOIN users u ON u.id = l.assigned_to`
  );

  let migrated = 0;
  for (const lead of leads.rows) {
    await withTenantTransaction(schemaName, async (client) => {
      // Reusing lead.id as the new form_submissions.id on purpose — see
      // the file header. thread_id = own id since leads had no
      // versioning concept before this.
      await client.query(
        `INSERT INTO form_submissions (id, form_id, header_data, submitted_by, submitted_at, thread_id, revision_number, is_latest)
         VALUES ($1, $2, $3, $4, $5, $1, 1, true)
         ON CONFLICT (id) DO NOTHING`,
        [
          lead.id, formId,
          JSON.stringify({
            title: lead.title, client_name: lead.client_name, contact_name: lead.contact_name,
            email: lead.email, phone: lead.phone, stage: lead.stage_name,
            expected_value: lead.expected_value, probability: lead.probability,
            expected_close: lead.expected_close, assigned_to_name: lead.assigned_to_name,
            source: lead.source, notes: lead.notes,
          }),
          lead.created_by, lead.created_at,
        ]
      );

      const items = await client.query(
        `SELECT li.*, p.name as product_name FROM lead_items li LEFT JOIN products p ON p.id = li.product_id WHERE li.lead_id = $1 ORDER BY li.sort_order`,
        [lead.id]
      );
      for (let i = 0; i < items.rows.length; i++) {
        const item = items.rows[i];
        await client.query(
          `INSERT INTO form_submission_items (id, submission_id, row_index, item_data)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [uuid(), lead.id, i, JSON.stringify({
            product_name: item.product_name, description: item.description,
            quantity: item.quantity, unit_price: item.unit_price, amount: item.amount,
          })]
        );
      }
    });
    migrated++;
  }

  return { formId, migrated };
}

export async function migrateQuotations(schemaName: string): Promise<{ formId: string; migrated: number }> {
  const formId = await createFormConfig(
    schemaName,
    {
      name: 'Quotations', slug: 'quotations-migrated', tabLabel: 'Quotations',
      revisioningEnabled: true,
    },
    [
      { key: 'number', label: 'Number', field_type: 'text', is_required: true, sort_order: 0 },
      { key: 'client_name', label: 'Client', field_type: 'text', sort_order: 1 },
      { key: 'lead_id', label: 'From Lead', field_type: 'text', sort_order: 2 },
      { key: 'date', label: 'Date', field_type: 'date', sort_order: 3 },
      { key: 'valid_until', label: 'Valid Until', field_type: 'date', sort_order: 4 },
      { key: 'status', label: 'Status', field_type: 'dropdown', sort_order: 5,
        dropdown_type: 'static',
        dropdown_static_options: ['draft', 'sent', 'approved', 'rejected', 'converted'].map((s) => ({ value: s, label: s })) },
      { key: 'subtotal', label: 'Subtotal', field_type: 'number', sort_order: 6 },
      { key: 'tax_amount', label: 'Tax', field_type: 'number', sort_order: 7 },
      { key: 'total', label: 'Total', field_type: 'number', sort_order: 8 },
      { key: 'notes', label: 'Notes', field_type: 'textarea', sort_order: 9 },
      { key: 'terms', label: 'Terms', field_type: 'textarea', sort_order: 10 },
    ]
  );

  // Every revision of every quotation, not just the latest — thread_id
  // and revision_number carry over directly since quotations already
  // used the exact same shape natively.
  const quotations = await tenantQuery<Record<string, unknown>>(
    schemaName,
    `SELECT q.*, c.name as client_name FROM quotations q LEFT JOIN clients c ON c.id = q.client_id`
  );

  let migrated = 0;
  for (const q of quotations.rows) {
    await withTenantTransaction(schemaName, async (client) => {
      await client.query(
        `INSERT INTO form_submissions (id, form_id, header_data, submitted_by, submitted_at, pdf_url, thread_id, revision_number, is_latest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          q.id, formId,
          JSON.stringify({
            number: q.number, client_name: q.client_name, lead_id: q.lead_id,
            date: q.date, valid_until: q.valid_until, status: q.status,
            subtotal: q.subtotal, tax_amount: q.tax_amount, total: q.total,
            notes: q.notes, terms: q.terms,
          }),
          q.created_by, q.created_at, q.pdf_url,
          q.thread_id, q.revision, q.is_latest,
        ]
      );

      const items = await client.query(
        `SELECT qi.*, p.name as product_name FROM quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = $1 ORDER BY qi.sort_order`,
        [q.id]
      );
      for (let i = 0; i < items.rows.length; i++) {
        const item = items.rows[i];
        await client.query(
          `INSERT INTO form_submission_items (id, submission_id, row_index, item_data)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [uuid(), q.id, i, JSON.stringify({
            product_name: item.product_name, description: item.description,
            quantity: item.quantity, unit_price: item.unit_price,
            discount_percent: item.discount_percent, tax_percent: item.tax_percent, amount: item.amount,
          })]
        );
      }
    });
    migrated++;
  }

  return { formId, migrated };
}
