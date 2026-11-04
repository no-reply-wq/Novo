/**
 * Auto-fill API
 *
 * When a dropdown field changes, fetches:
 * 1. Single-field autofill: the value of a specific column from the linked record
 * 2. Line-item autofill: all rows from a child table linked to the selected record
 *
 * Works against any real table in the tenant's schema — validated live
 * via information_schema, not a hardcoded table/column map, so a newly
 * created custom table or field works immediately with no code change.
 *
 * GET /api/tenant/form-builder/autofill
 *   ?tenant=slug
 *   &formId=...
 *   &sourceFieldKey=...   (the field that changed)
 *   &sourceValue=...      (the new value of that field)
 *   &mode=single|lineitems
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { tableExistsInTenantSchema, columnExistsOnTable } from '@/lib/db/schema-introspection';

const IDENTIFIER_SHAPE = /^[a-z][a-z0-9_]{0,62}$/;

/** Validates a table+columns combination actually exists in this tenant's schema. Returns the list of columns that passed. */
async function validateTableAndColumns(schemaName: string, table: string, columns: string[]): Promise<{ valid: boolean; okColumns: string[] }> {
  if (!IDENTIFIER_SHAPE.test(table) || !(await tableExistsInTenantSchema(schemaName, table))) {
    return { valid: false, okColumns: [] };
  }
  const checks = await Promise.all(
    columns.map(async (c) => (IDENTIFIER_SHAPE.test(c) && (await columnExistsOnTable(schemaName, table, c))) ? c : null)
  );
  const okColumns = checks.filter((c): c is string => c !== null);
  return { valid: true, okColumns };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  const sourceFieldKey = searchParams.get('sourceFieldKey');
  const sourceValue = searchParams.get('sourceValue');
  const mode = searchParams.get('mode') as 'single' | 'lineitems' | null;

  if (!tenantSlug || !formId || !sourceFieldKey || !sourceValue || !mode) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Load the form config to find autofill settings
  const formResult = await tenantQuery(
    ctx.schemaName,
    `SELECT fc.*, 
            json_agg(ff.* ORDER BY ff.sort_order) as fields
     FROM form_configs fc
     LEFT JOIN form_fields ff ON ff.form_id = fc.id
     WHERE fc.id = $1
     GROUP BY fc.id`,
    [formId]
  );

  const form = formResult.rows[0] as {
    autofill_source_field: string;
    autofill_child_table: string;
    autofill_link_column: string;
    autofill_column_map: Record<string, string>;
    fields: Array<{
      key: string;
      autofill_source_field: string;
      autofill_column: string;
      dropdown_source_table: string;
    }>;
  };

  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  if (mode === 'single') {
    // Find fields that autofill from this source field
    const autofillFields = (form.fields || []).filter(
      (f) => f.autofill_source_field === sourceFieldKey
    );

    if (autofillFields.length === 0) {
      return NextResponse.json({ values: {} });
    }

    // Find the source field's linked table
    const sourceField = (form.fields || []).find((f) => f.key === sourceFieldKey);
    if (!sourceField?.dropdown_source_table) {
      return NextResponse.json({ values: {} });
    }

    const tableName = sourceField.dropdown_source_table;
    const requestedColumns = [...new Set(autofillFields.map((f) => f.autofill_column).filter(Boolean))];
    if (requestedColumns.length === 0) return NextResponse.json({ values: {} });

    const { valid, okColumns } = await validateTableAndColumns(ctx.schemaName, tableName, requestedColumns);
    if (!valid || okColumns.length === 0) return NextResponse.json({ values: {} });

    const columnList = okColumns.join(', ');
    const record = await tenantQuery(
      ctx.schemaName,
      `SELECT ${columnList} FROM ${tableName} WHERE id = $1 LIMIT 1`,
      [sourceValue]
    );

    if (record.rows.length === 0) return NextResponse.json({ values: {} });

    const row = record.rows[0] as Record<string, unknown>;
    const values: Record<string, unknown> = {};

    for (const field of autofillFields) {
      if (field.autofill_column && okColumns.includes(field.autofill_column) && row[field.autofill_column] !== undefined) {
        values[field.key] = row[field.autofill_column];
      }
    }

    return NextResponse.json({ values });
  }

  if (mode === 'lineitems') {
    // Form-level line item autofill
    if (
      !form.autofill_source_field ||
      form.autofill_source_field !== sourceFieldKey ||
      !form.autofill_child_table ||
      !form.autofill_link_column
    ) {
      return NextResponse.json({ lineItems: [] });
    }

    const childTable = form.autofill_child_table;
    const columnMap = form.autofill_column_map as Record<string, string>;
    if (!columnMap || Object.keys(columnMap).length === 0) {
      return NextResponse.json({ lineItems: [] });
    }

    const requestedColumns = [...new Set(Object.values(columnMap))];
    const { valid, okColumns } = await validateTableAndColumns(ctx.schemaName, childTable, requestedColumns);
    if (!valid || okColumns.length === 0) return NextResponse.json({ lineItems: [] });

    if (!(await columnExistsOnTable(ctx.schemaName, childTable, form.autofill_link_column)) || !IDENTIFIER_SHAPE.test(form.autofill_link_column)) {
      return NextResponse.json({ error: `Link column "${form.autofill_link_column}" does not exist on ${childTable}` }, { status: 400 });
    }

    const columnList = okColumns.join(', ');
    // Only sort by sort_order if the child table actually has one — this
    // used to be unconditional and would throw a raw SQL error on any
    // child table without that column, breaking line-item autofill for
    // most custom tables.
    const hasSortOrder = await columnExistsOnTable(ctx.schemaName, childTable, 'sort_order');
    const orderClause = hasSortOrder ? 'ORDER BY sort_order ASC NULLS LAST' : '';

    const rows = await tenantQuery(
      ctx.schemaName,
      `SELECT ${columnList} FROM ${childTable}
       WHERE ${form.autofill_link_column} = $1
       ${orderClause}`,
      [sourceValue]
    );

    // Remap DB columns to form field keys — only using columns that
    // actually passed validation above.
    const lineItems = rows.rows.map((row) => {
      const item: Record<string, unknown> = {};
      for (const [formKey, dbCol] of Object.entries(columnMap)) {
        if (okColumns.includes(dbCol)) item[formKey] = (row as Record<string, unknown>)[dbCol];
      }
      return item;
    });

    return NextResponse.json({ lineItems });
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
}
