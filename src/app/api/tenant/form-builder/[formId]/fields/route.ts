import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { v4 as uuid } from 'uuid';

/**
 * This file previously used a completely different, wrong set of
 * column names (section, required, hint, dropdown_value_col,
 * autofill_table, formula_sum_column, read_only, hidden, etc.) that
 * don't exist anywhere in the real form_fields table - confirmed
 * against tenant-schema.sql directly. The GET's own ORDER BY
 * referenced a "section" column that has never existed, which is
 * exactly the 500 error this was producing. Likely broke field
 * loading for every custom form this whole time, not just Masters.
 * Rewritten to match the real schema exactly.
 */

export async function GET(req: NextRequest, { params: rawParams }: { params: Promise<{ formId: string }> }) {
  const params = await rawParams;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const fields = await tenantQuery(ctx.schemaName,
    `SELECT * FROM form_fields WHERE form_id = $1 ORDER BY is_line_item, sort_order`, [params.formId]);

  return NextResponse.json({ fields: fields.rows });
}

export async function PUT(req: NextRequest, { params: rawParams }: { params: Promise<{ formId: string }> }) {
  const params = await rawParams;
  // Full replace of all fields for a form (used by form builder editor "save")
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const { fields } = await req.json().catch(() => ({ fields: [] }));
  if (!Array.isArray(fields)) return NextResponse.json({ error: 'fields array required' }, { status: 400 });

  await withTenantTransaction(ctx.schemaName, async (client) => {
    await client.query('DELETE FROM form_fields WHERE form_id = $1', [params.formId]);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await client.query(
        `INSERT INTO form_fields (
          id, form_id, key, label, field_type, is_line_item, is_required, is_readonly,
          sort_order, placeholder, default_value, width,
          dropdown_type, dropdown_static_options, dropdown_source_table, dropdown_source_schema,
          dropdown_value_column, dropdown_label_column,
          dropdown_filter_column, dropdown_filter_field, dropdown_filter_value,
          formula_type, formula_expression, formula_target_field,
          autofill_source_field, autofill_column, is_row_number,
          visible_when_field, visible_when_value
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
        [
          f.id ?? uuid(), params.formId, f.key, f.label, f.field_type,
          f.is_line_item ?? false, f.is_required ?? false, f.is_readonly ?? false,
          f.sort_order ?? i, f.placeholder ?? null, f.default_value ?? null, f.width ?? 'full',
          f.dropdown_type ?? null, f.dropdown_static_options ? JSON.stringify(f.dropdown_static_options) : '[]',
          f.dropdown_source_table ?? null, f.dropdown_source_schema ?? null,
          f.dropdown_value_column ?? null, f.dropdown_label_column ?? null,
          f.dropdown_filter_column ?? null, f.dropdown_filter_field ?? null, f.dropdown_filter_value ?? null,
          f.formula_type ?? null, f.formula_expression ?? null, f.formula_target_field ?? null,
          f.autofill_source_field ?? null, f.autofill_column ?? null,
          f.is_row_number ?? false,
          f.visible_when_field ?? null, f.visible_when_value ?? null,
        ]
      );
    }
  });

  return NextResponse.json({ success: true });
}
