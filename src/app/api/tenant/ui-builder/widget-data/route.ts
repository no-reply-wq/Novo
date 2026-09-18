/**
 * Table Widget Data API
 *
 * Live data for a UI Builder table widget — same dynamic schema
 * validation as the Form Builder dropdown-data route, so a widget can
 * point at any real table in the tenant's schema.
 *
 * GET /api/tenant/ui-builder/widget-data
 *   ?tenant=slug&table=leads&columns=["name","status"]&filters=[{"column":"status","value":"open"}]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { tableExistsInTenantSchema, columnExistsOnTable } from '@/lib/db/schema-introspection';

const IDENTIFIER_SHAPE = /^[a-z][a-z0-9_]{0,62}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const table = searchParams.get('table');
  let columns: string[] = [];
  let filters: Array<{ column: string; value: string }> = [];

  try {
    columns = JSON.parse(searchParams.get('columns') ?? '[]');
    filters = JSON.parse(searchParams.get('filters') ?? '[]');
  } catch {
    return NextResponse.json({ error: 'Invalid columns/filters JSON' }, { status: 400 });
  }

  if (!tenantSlug || !table) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  if (!IDENTIFIER_SHAPE.test(table) || !(await tableExistsInTenantSchema(ctx.schemaName, table))) {
    return NextResponse.json({ error: `Table "${table}" does not exist` }, { status: 400 });
  }

  let okColumns: string[] = [];
  if (columns.length === 0) {
    // No columns specified — select all
    okColumns = ['*'];
  } else {
    const columnChecks = await Promise.all(
      columns.map(async (c) => (IDENTIFIER_SHAPE.test(c) && (await columnExistsOnTable(ctx.schemaName, table, c))) ? c : null)
    );
    okColumns = columnChecks.filter((c): c is string => c !== null);
    if (okColumns.length === 0) {
      return NextResponse.json({ error: 'None of the requested columns exist on this table' }, { status: 400 });
    }
  }

  const params: unknown[] = [];
  let whereClause = '';
  for (const f of filters) {
    if (!IDENTIFIER_SHAPE.test(f.column) || !(await columnExistsOnTable(ctx.schemaName, table, f.column))) continue;
    params.push(f.value);
    whereClause += whereClause ? ` AND ${f.column} = $${params.length}` : `WHERE ${f.column} = $${params.length}`;
  }

  if (await columnExistsOnTable(ctx.schemaName, table, 'active')) {
    whereClause = whereClause ? `${whereClause} AND active = true` : 'WHERE active = true';
  }

  const pageSize = parseInt(searchParams.get('pageSize') ?? '100');
  const sql = `SELECT ${okColumns.join(', ')} FROM ${table} ${whereClause} LIMIT ${pageSize}`;

  try {
    const result = await tenantQuery(ctx.schemaName, sql, params);
    return NextResponse.json({ rows: result.rows });
  } catch (err) {
    console.error('Widget data query error:', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
