/**
 * UI Builder API
 * Manages buttons and table widgets per page.
 * Also exposes the list of available pages (built-in + custom tabs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

// Static list of built-in page keys
const BUILT_IN_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
];

// GET /api/tenant/ui-builder?tenant=&resource=pages|buttons|tables&pageKey=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const resource = searchParams.get('resource') ?? 'all';
  const pageKey = searchParams.get('pageKey');

  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  if (resource === 'pages') {
    // Return built-in pages + custom tables + active custom tabs
    const [customTabs, customTables] = await Promise.all([
      tenantQuery(ctx.schemaName,
        `SELECT slug, tab_label as label FROM form_configs WHERE show_as_tab = true AND active = true ORDER BY tab_sort_order ASC`
      ).catch(() => ({ rows: [] })),
      tenantQuery(ctx.schemaName,
        `SELECT slug, label FROM _tables WHERE NOT is_hidden ORDER BY created_at ASC`
      ).catch(() => ({ rows: [] })),
    ]);

    const pages = [
      ...BUILT_IN_PAGES,
      ...customTables.rows.map((t: { slug: string; label: string }) => ({
        key: `data:${t.slug}`,
        label: t.label,
        isCustom: true,
      })),
      ...customTabs.rows.map((t: { slug: string; label: string }) => ({
        key: `custom:${t.slug}`,
        label: t.label,
        isCustom: true,
      })),
    ];

    return NextResponse.json({ pages });
  }

  if (resource === 'buttons') {
    const where = pageKey ? 'WHERE page_key = $1 AND active = true' : 'WHERE active = true';
    const params = pageKey ? [pageKey] : [];
    const buttons = await tenantQuery(
      ctx.schemaName,
      `SELECT b.*, fc.name as form_name, fc.slug as form_slug
       FROM ui_buttons b
       LEFT JOIN form_configs fc ON fc.id = b.form_id
       ${where}
       ORDER BY sort_order ASC`,
      params
    );
    return NextResponse.json({ buttons: buttons.rows });
  }

  if (resource === 'tables') {
    const where = pageKey ? 'WHERE page_key = $1 AND active = true' : 'WHERE active = true';
    const params = pageKey ? [pageKey] : [];
    const tables = await tenantQuery(
      ctx.schemaName,
      `SELECT * FROM ui_tables ${where} ORDER BY sort_order ASC`,
      params
    );
    return NextResponse.json({ tables: tables.rows });
  }

  if (resource === 'visibility') {
    const where = pageKey ? 'WHERE page_key = $1' : '';
    const params = pageKey ? [pageKey] : [];
    const rules = await tenantQuery(
      ctx.schemaName,
      `SELECT * FROM ui_visibility_rules ${where}`,
      params
    );
    return NextResponse.json({ rules: rules.rows });
  }

  if (resource === 'all') {
    // This is what usePageCustomization actually calls (no `resource`
    // param at all, which is why it defaults to 'all') — there was no
    // handler for this case before, so every request silently fell
    // through to "Unknown resource type" below. Since the hook's fetch
    // still resolves with a 200-shaped JSON body either way, nothing
    // ever surfaced as a visible error — it just looked like nothing
    // had ever been configured, on every single page, regardless of
    // what an admin actually set up in UI Builder.
    if (!pageKey) return NextResponse.json({ error: 'Missing pageKey' }, { status: 400 });
    const [buttons, tables, rules] = await Promise.all([
      tenantQuery(
        ctx.schemaName,
        `SELECT b.*, fc.name as form_name, fc.slug as form_slug
         FROM ui_buttons b
         LEFT JOIN form_configs fc ON fc.id = b.form_id
         WHERE b.page_key = $1 AND b.active = true
         ORDER BY b.sort_order ASC`,
        [pageKey]
      ),
      tenantQuery(ctx.schemaName, `SELECT * FROM ui_tables WHERE page_key = $1 AND active = true ORDER BY sort_order ASC`, [pageKey]),
      tenantQuery(ctx.schemaName, `SELECT * FROM ui_visibility_rules WHERE page_key = $1`, [pageKey]),
    ]);
    return NextResponse.json({ buttons: buttons.rows, tables: tables.rows, visibility: rules.rows });
  }

  // Return everything for a page
  if (pageKey) {
    const [buttons, tables, visibility] = await Promise.all([
      tenantQuery(ctx.schemaName,
        `SELECT b.*, fc.name as form_name, fc.slug as form_slug
         FROM ui_buttons b
         LEFT JOIN form_configs fc ON fc.id = b.form_id
         WHERE b.page_key = $1 AND b.active = true
         ORDER BY b.sort_order ASC`, [pageKey]),
      tenantQuery(ctx.schemaName,
        'SELECT * FROM ui_tables WHERE page_key = $1 AND active = true ORDER BY sort_order ASC',
        [pageKey]),
      tenantQuery(ctx.schemaName,
        'SELECT * FROM ui_visibility_rules WHERE page_key = $1', [pageKey]),
    ]);

    return NextResponse.json({
      buttons: buttons.rows,
      tables: tables.rows,
      visibility: visibility.rows,
    });
  }

  return NextResponse.json({ error: 'Specify resource or pageKey' }, { status: 400 });
}

const ButtonSchema = z.object({
  pageKey: z.string().min(1),
  label: z.string().min(1).max(100),
  icon: z.string().optional(),
  placement: z.enum(['toolbar', 'row_actions']).default('toolbar'),
  formId: z.string().optional(),
  prefillField: z.string().optional(),
  visibleRoles: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

const TableWidgetSchema = z.object({
  pageKey: z.string().min(1),
  title: z.string().optional(),
  sourceTable: z.string().min(1),
  sourceSchema: z.string().optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.string().default('text'),
  })),
  filters: z.array(z.object({ column: z.string(), value: z.string() })).default([]),
  showSumRow: z.boolean().default(false),
  sumColumns: z.array(z.string()).default([]),
  collapsible: z.boolean().default(false),
  defaultCollapsed: z.boolean().default(false),
  visibleRoles: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

const VisibilityRuleSchema = z.object({
  pageKey: z.string().min(1),
  columnLabel: z.string().min(1),
  hiddenRoles: z.array(z.string()).default([]),
});

// POST /api/tenant/ui-builder?tenant=&resource=button|table|visibility
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const resource = searchParams.get('resource');
  if (!tenantSlug || !resource) {
    return NextResponse.json({ error: 'Missing tenant or resource' }, { status: 400 });
  }

  const ctx = await requirePermission(tenantSlug, 'ui_builder', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));

  if (resource === 'button') {
    const parsed = ButtonSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    const d = parsed.data;
    const id = uuid();
    await tenantQuery(
      ctx.schemaName,
      `INSERT INTO ui_buttons (id, page_key, label, icon, placement, form_id, prefill_field, visible_roles, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, d.pageKey, d.label, d.icon ?? null, d.placement, d.formId ?? null,
       d.prefillField ?? null, JSON.stringify(d.visibleRoles), d.sortOrder]
    );
    const result = await tenantQuery(ctx.schemaName, 'SELECT * FROM ui_buttons WHERE id = $1', [id]);
    return NextResponse.json({ button: result.rows[0] }, { status: 201 });
  }

  if (resource === 'table') {
    const parsed = TableWidgetSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    const d = parsed.data;
    const id = uuid();
    await tenantQuery(
      ctx.schemaName,
      `INSERT INTO ui_tables (id, page_key, title, source_table, source_schema, columns,
                              filters, show_sum_row, sum_columns, collapsible, default_collapsed,
                              visible_roles, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, d.pageKey, d.title ?? null, d.sourceTable, d.sourceSchema ?? null,
       JSON.stringify(d.columns), JSON.stringify(d.filters),
       d.showSumRow, JSON.stringify(d.sumColumns), d.collapsible, d.defaultCollapsed,
       JSON.stringify(d.visibleRoles), d.sortOrder]
    );
    const result = await tenantQuery(ctx.schemaName, 'SELECT * FROM ui_tables WHERE id = $1', [id]);
    return NextResponse.json({ table: result.rows[0] }, { status: 201 });
  }

  if (resource === 'visibility') {
    const parsed = VisibilityRuleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    const d = parsed.data;
    const id = uuid();
    await tenantQuery(
      ctx.schemaName,
      `INSERT INTO ui_visibility_rules (id, page_key, column_label, hidden_roles)
       VALUES ($1,$2,$3,$4)`,
      [id, d.pageKey, d.columnLabel, JSON.stringify(d.hiddenRoles)]
    );
    const result = await tenantQuery(ctx.schemaName, 'SELECT * FROM ui_visibility_rules WHERE id = $1', [id]);
    return NextResponse.json({ rule: result.rows[0] }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unknown resource type' }, { status: 400 });
}

// DELETE /api/tenant/ui-builder?tenant=&resource=button|table|visibility&id=
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const resource = searchParams.get('resource');
  const id = searchParams.get('id');
  if (!tenantSlug || !resource || !id) {
    return NextResponse.json({ error: 'Missing tenant, resource, or id' }, { status: 400 });
  }

  const ctx = await requirePermission(tenantSlug, 'ui_builder', 'delete');
  if (ctx instanceof NextResponse) return ctx;

  if (resource === 'button') {
    await tenantQuery(ctx.schemaName, `UPDATE ui_buttons SET active = false WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  }
  if (resource === 'table') {
    await tenantQuery(ctx.schemaName, `UPDATE ui_tables SET active = false WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  }
  if (resource === 'visibility') {
    // Visibility rules aren't referenced elsewhere the way buttons/tables
    // might be — a real delete rather than a soft one is fine here, and
    // keeps the rules list from accumulating dead rows over time.
    await tenantQuery(ctx.schemaName, `DELETE FROM ui_visibility_rules WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown resource type' }, { status: 400 });
}
