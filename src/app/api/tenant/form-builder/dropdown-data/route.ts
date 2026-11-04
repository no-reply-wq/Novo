/**
 * Dynamic Dropdown Data API
 *
 * Resolves live dropdown options from any table in the tenant's own
 * schema, with optional cascading filters. Called client-side as a
 * field value changes to re-fetch options.
 *
 * "Any table" is genuinely any table now — table/column names are
 * validated by checking they actually exist in the tenant's live
 * schema (via information_schema), not against a hardcoded list. A
 * newly created custom table becomes selectable immediately, with no
 * code change required.
 *
 * GET /api/tenant/form-builder/dropdown-data
 *   ?tenant=slug
 *   &table=products
 *   &valueColumn=id
 *   &labelColumn=name
 *   &filterColumn=category_id      (optional)
 *   &filterValue=cat_abc123        (the actual value to filter by)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { tableExistsInTenantSchema, columnExistsOnTable } from '@/lib/db/schema-introspection';

// Still worth a basic shape check before even hitting the database —
// cheap, and rules out obviously-malformed input early.
const IDENTIFIER_SHAPE = /^[a-z][a-z0-9_]{0,62}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const table = searchParams.get('table');
  const valueColumn = searchParams.get('valueColumn') ?? 'id';
  const labelColumn = searchParams.get('labelColumn') ?? 'name';
  const filterColumn = searchParams.get('filterColumn');
  const filterValue = searchParams.get('filterValue');
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500);

  if (!tenantSlug || !table) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const identifiersToCheck = [table, valueColumn, labelColumn, ...(filterColumn ? [filterColumn] : [])];
  for (const id of identifiersToCheck) {
    if (!IDENTIFIER_SHAPE.test(id)) {
      return NextResponse.json({ error: `"${id}" is not a valid identifier` }, { status: 400 });
    }
  }

  const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Validate every identifier actually exists in THIS tenant's schema —
  // this is the real security boundary, not the shape check above.
  if (!(await tableExistsInTenantSchema(ctx.schemaName, table))) {
    return NextResponse.json({ error: `Table "${table}" does not exist` }, { status: 400 });
  }
  const [valueOk, labelOk, filterOk] = await Promise.all([
    columnExistsOnTable(ctx.schemaName, table, valueColumn),
    columnExistsOnTable(ctx.schemaName, table, labelColumn),
    filterColumn ? columnExistsOnTable(ctx.schemaName, table, filterColumn) : Promise.resolve(true),
  ]);
  if (!valueOk) return NextResponse.json({ error: `Column "${valueColumn}" does not exist on ${table}` }, { status: 400 });
  if (!labelOk) return NextResponse.json({ error: `Column "${labelColumn}" does not exist on ${table}` }, { status: 400 });
  if (filterColumn && !filterOk) return NextResponse.json({ error: `Column "${filterColumn}" does not exist on ${table}` }, { status: 400 });

  // Build safe parameterized query — identifiers are now proven to be
  // real column/table names on this tenant's own schema, so interpolating
  // them (values still always go through $N params) is safe.
  const params: unknown[] = [];
  let whereClause = '';

  if (filterColumn && filterValue !== null && filterValue !== undefined) {
    params.push(filterValue);
    whereClause += `WHERE ${filterColumn} = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const cond = `LOWER(${labelColumn}::text) LIKE $${params.length}`;
    whereClause = whereClause
      ? `${whereClause} AND ${cond}`
      : `WHERE ${cond}`;
  }

  // If this table happens to have an `active` column, only show active
  // rows — checked live instead of a hardcoded per-table list, so it
  // works the same way for a brand new custom table too.
  if (await columnExistsOnTable(ctx.schemaName, table, 'active')) {
    const cond = 'active = true';
    whereClause = whereClause ? `${whereClause} AND ${cond}` : `WHERE ${cond}`;
  }

  params.push(limit);

  const sql = `SELECT ${valueColumn} as value, ${labelColumn} as label
               FROM ${table}
               ${whereClause}
               ORDER BY ${labelColumn}
               LIMIT $${params.length}`;

  try {
    const result = await tenantQuery<{ value: unknown; label: unknown }>(
      ctx.schemaName,
      sql,
      params
    );

    return NextResponse.json({
      options: result.rows.map((r) => ({
        value: r.value,
        label: String(r.label ?? r.value),
      })),
    });
  } catch (err) {
    console.error('Dropdown query error:', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
