/**
 * Form Builder API
 * GET  /api/tenant/form-builder?tenant=slug  — list form configs
 * POST /api/tenant/form-builder              — create form config
 *
 * The validation schema below used to be written in camelCase
 * (showAsTab, tabLabel, ...) while the actual frontend (FormDraft in
 * FormBuilderEditor.tsx) has always sent snake_case (show_as_tab,
 * tab_label, ...). Since every one of those fields was `.optional()`
 * or had a `.default()`, Zod never rejected the mismatched request —
 * it just silently treated every one of those fields as absent and
 * used its default. In practice this meant: creating a brand-new form
 * with "Show as tab" checked, or any autofill config filled in, never
 * actually saved any of that — it only worked if you saved the form
 * once bare, then edited it afterward (PATCH used snake_case
 * correctly, just with an incomplete field whitelist). Fixed by
 * matching the schema to what's actually sent, and completing the
 * insert to cover every column PATCH already knew how to update.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const FormConfigSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  show_as_tab: z.boolean().default(false),
  tab_label: z.string().optional(),
  tab_icon: z.string().optional(),
  tab_visible_roles: z.array(z.string()).default([]),
  tab_sort_order: z.number().int().default(999),
  table_columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.string(),
  })).default([]),
  pdf_template_url: z.string().optional(),
  pdf_output_folder: z.string().optional(),
  autofill_source_field: z.string().optional(),
  autofill_child_table: z.string().optional(),
  autofill_link_column: z.string().optional(),
  autofill_column_map: z.record(z.string(), z.string()).default({}),
  board_view_enabled: z.boolean().default(false),
  board_group_by_field: z.string().optional(),
  revisioning_enabled: z.boolean().default(false),
  is_master: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'view');
  if (ctx instanceof NextResponse) return ctx;
  console.log(`[form-builder:GET] tenant="${tenantSlug}" resolved schema="${ctx.schemaName}"`);

  const forms = await tenantQuery(
    ctx.schemaName,
    `SELECT id, name, slug, description, category,
            show_as_tab, tab_label, tab_icon, tab_visible_roles, tab_sort_order,
            table_columns, pdf_template_url, pdf_output_folder,
            autofill_source_field, autofill_child_table, autofill_link_column, autofill_column_map,
            board_view_enabled, board_group_by_field,
            revisioning_enabled,
            is_master,
            active, created_at, updated_at
     FROM form_configs
     WHERE active = true
     ORDER BY name ASC`
  );

  return NextResponse.json({ forms: forms.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = FormConfigSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  // Check slug uniqueness
  const existing = await tenantQuery(
    ctx.schemaName,
    'SELECT id FROM form_configs WHERE slug = $1',
    [d.slug]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  }

  const id = uuid();
  await tenantQuery(
    ctx.schemaName,
    `INSERT INTO form_configs (
       id, name, slug, description, category,
       show_as_tab, tab_label, tab_icon, tab_visible_roles, tab_sort_order,
       table_columns, pdf_template_url, pdf_output_folder,
       autofill_source_field, autofill_child_table, autofill_link_column, autofill_column_map,
       board_view_enabled, board_group_by_field,
       revisioning_enabled, is_master,
       created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      id, d.name, d.slug, d.description ?? null, d.category ?? null,
      d.show_as_tab, d.tab_label ?? null, d.tab_icon ?? null,
      JSON.stringify(d.tab_visible_roles), d.tab_sort_order,
      JSON.stringify(d.table_columns), d.pdf_template_url ?? null, d.pdf_output_folder ?? null,
      d.autofill_source_field ?? null, d.autofill_child_table ?? null,
      d.autofill_link_column ?? null, JSON.stringify(d.autofill_column_map),
      d.board_view_enabled, d.board_group_by_field ?? null,
      d.revisioning_enabled, d.is_master,
      ctx.userId,
    ]
  );

  const result = await tenantQuery(
    ctx.schemaName,
    'SELECT * FROM form_configs WHERE id = $1',
    [id]
  );

  return NextResponse.json({ form: result.rows[0] }, { status: 201 });
}
