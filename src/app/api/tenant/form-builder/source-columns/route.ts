/**
 * GET /api/tenant/form-builder/source-columns?tenant=slug&source=<table or form:id>
 *
 * Returns the pickable "columns" for whichever source was chosen in
 * available-sources - real columns (via live schema introspection) for
 * a table, or field keys for a Master form. Lets the Value/Label
 * column pickers in the Field Editor be real dropdowns instead of
 * free-text inputs, for both source types.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { listColumnsOnTable, tableExistsInTenantSchema } from '@/lib/db/schema-introspection';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const source = searchParams.get('source');
  if (!tenantSlug || !source) return NextResponse.json({ error: 'Missing tenant or source' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;

  if (source.startsWith('form:')) {
    const formId = source.slice('form:'.length);
    const fields = await tenantQuery<{ key: string; label: string }>(
      ctx.schemaName,
      `SELECT key, label FROM form_fields WHERE form_id = $1 AND is_line_item = false ORDER BY sort_order`,
      [formId]
    );
    return NextResponse.json({ columns: fields.rows.map((f) => ({ value: f.key, label: f.label })) });
  }

  if (!(await tableExistsInTenantSchema(ctx.schemaName, source))) {
    return NextResponse.json({ error: `Table "${source}" does not exist` }, { status: 400 });
  }
  const columns = await listColumnsOnTable(ctx.schemaName, source);
  return NextResponse.json({ columns: columns.map((c) => ({ value: c, label: c })) });
}
