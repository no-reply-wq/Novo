import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest, { params: rawParams }: { params: Promise<{ formId: string }> }) {
  const params = await rawParams;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const result = await tenantQuery(ctx.schemaName,
    'SELECT * FROM form_configs WHERE id = $1', [params.formId]);
  if (result.rows.length === 0) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  return NextResponse.json({ form: result.rows[0] });
}

export async function PATCH(req: NextRequest, { params: rawParams }: { params: Promise<{ formId: string }> }) {
  const params = await rawParams;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const allowedFields = [
    'name', 'description', 'category', 'show_as_tab', 'tab_label',
    'tab_icon', 'tab_sort_order', 'tab_visible_roles', 'active', 'settings',
    'table_columns', 'pdf_template_url', 'pdf_output_folder',
    'autofill_source_field', 'autofill_child_table', 'autofill_link_column', 'autofill_column_map',
    'board_view_enabled', 'board_group_by_field', 'revisioning_enabled', 'is_master',
  ];

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (allowedFields.includes(key)) {
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(params.formId);
  await tenantQuery(ctx.schemaName,
    `UPDATE form_configs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params: rawParams }: { params: Promise<{ formId: string }> }) {
  const params = await rawParams;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'delete');
  if (ctx instanceof NextResponse) return ctx;

  // Soft-delete: deactivate instead of hard delete to preserve submissions
  await tenantQuery(ctx.schemaName,
    `UPDATE form_configs SET active = false, updated_at = NOW() WHERE id = $1`, [params.formId]);

  return NextResponse.json({ success: true });
}
