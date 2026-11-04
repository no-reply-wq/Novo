import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { ident, clampInt, ALLOWED_SORT_DIRS } from '@/lib/db/sql';

/** Fire workflows directly (no self-fetch with user cookie). */
async function fireWorkflows(
  schemaName: string,
  tenantSlug: string,
  triggerType: string,
  tableId: string,
  tableSlug: string,
  row: Record<string, unknown>,
  oldRow?: Record<string, unknown>
) {
  try {
    const workflows = await tenantQuery<{
      id: string;
      definition: { trigger: { type: string; table_id: string }; actions: unknown[] };
    }>(
      schemaName,
      `SELECT id, definition FROM _workflows
       WHERE (definition->>'trigger')::jsonb->>'type' = $1
         AND (definition->>'trigger')::jsonb->>'table_id' = $2
         AND active = true`,
      [triggerType, tableId]
    );

    for (const wf of workflows.rows) {
      await tenantQuery(
        schemaName,
        `INSERT INTO _workflow_logs (workflow_id, trigger_type, table_slug, row_data, old_row_data, status, tenant_slug)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [wf.id, triggerType, tableSlug, JSON.stringify(row), oldRow ? JSON.stringify(oldRow) : null, tenantSlug]
      );
    }
  } catch {
    // Workflow errors must never crash the main request
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  try {
    const page = clampInt(searchParams.get('page'), 1, 1000, 1);
    const pageSize = clampInt(searchParams.get('pageSize'), 1, 500, 50);
    const search = searchParams.get('search') ?? '';
    const sortFieldRaw = searchParams.get('sort') ?? 'created_at';
    const sortDirRaw = (searchParams.get('dir') ?? 'desc').toLowerCase();
    const sortDir = ALLOWED_SORT_DIRS.has(sortDirRaw) ? sortDirRaw.toUpperCase() : 'DESC';

    const tableMeta = await tenantQuery<{ id: string; slug: string; label: string }>(ctx.schemaName, `SELECT * FROM _tables WHERE id = $1`, [tableId]);
    if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    const table = tableMeta.rows[0];

    // Validate sort field against actual columns
    const tableIdent = ident(`ct_${table.slug}`);
    const fields = await tenantQuery<{ slug: string; type: string }>(ctx.schemaName, `SELECT * FROM _fields WHERE table_id = $1 ORDER BY field_order ASC`, [tableId]);
    const allowedSortCols = new Set(['created_at', 'updated_at', 'id', ...fields.rows.map((f) => f.slug)]);

    let sortFieldIdent: string;
    try {
      if (!allowedSortCols.has(sortFieldRaw)) throw new Error('not allowed');
      sortFieldIdent = ident(sortFieldRaw);
    } catch {
      sortFieldIdent = '"created_at"';
    }

    const textFields = fields.rows.filter((f) =>
      ['text', 'email', 'phone', 'url', 'select', 'long_text'].includes(f.type)
    );

    let whereClause = '';
    const params: unknown[] = [];
    if (search && textFields.length > 0) {
      const conditions = textFields.map((f, i: number) => `${ident(f.slug)}::text ILIKE $${i + 1}`);
      params.push(...textFields.map(() => `%${search}%`));
      whereClause = `WHERE ${conditions.join(' OR ')}`;
    }

    const offset = (page - 1) * pageSize;
    const countResult = await tenantQuery<{ total: string }>(ctx.schemaName, `SELECT COUNT(*) as total FROM ${tableIdent} ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);
    params.push(pageSize, offset);
    const rows = await tenantQuery(
      ctx.schemaName,
      `SELECT * FROM ${tableIdent} ${whereClause} ORDER BY ${sortFieldIdent} ${sortDir} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return NextResponse.json({ rows: rows.rows, total, page, pageSize, pages: Math.ceil(total / pageSize), table, fields: fields.rows });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'create');
  if (ctx instanceof NextResponse) return ctx;

  try {
    const tableMeta = await tenantQuery<{ slug: string }>(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
    if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    const tableSlug = tableMeta.rows[0].slug;
    const tableIdent = ident(`ct_${tableSlug}`);
    const body = await req.json();
    const { data = {} } = body;

    const fields = await tenantQuery<{ slug: string; type: string }>(ctx.schemaName, `SELECT slug, type FROM _fields WHERE table_id = $1 AND NOT is_system AND type != 'auto_number'`, [tableId]);
    const validSlugs = new Set(fields.rows.map((f) => f.slug));
    const cols = Object.keys(data).filter(k => validSlugs.has(k));

    let newRow: Record<string, unknown>;
    if (cols.length === 0) {
      const result = await tenantQuery(ctx.schemaName, `INSERT INTO ${tableIdent} DEFAULT VALUES RETURNING *`);
      newRow = result.rows[0];
    } else {
      const colIdents = cols.map(c => ident(c)).join(', ');
      const vals = cols.map((_, i) => `$${i + 1}`);
      const result = await tenantQuery(ctx.schemaName, `INSERT INTO ${tableIdent} (${colIdents}) VALUES (${vals.join(',')}) RETURNING *`, cols.map(c => data[c]));
      newRow = result.rows[0];
    }

    await fireWorkflows(ctx.schemaName, tenantSlug, 'on_create', tableId, tableSlug, newRow);
    return NextResponse.json({ row: newRow });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const rowId = searchParams.get('rowId');
  if (!tenantSlug || !tableId || !rowId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  try {
    const tableMeta = await tenantQuery<{ slug: string }>(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
    if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    const tableSlug = tableMeta.rows[0].slug;
    const tableIdent = ident(`ct_${tableSlug}`);
    const body = await req.json();
    const { data = {} } = body;

    const fields = await tenantQuery<{ slug: string }>(ctx.schemaName, `SELECT slug FROM _fields WHERE table_id = $1 AND NOT is_system AND type != 'auto_number'`, [tableId]);
    const validSlugs = new Set(fields.rows.map((f) => f.slug));
    const cols = Object.keys(data).filter(k => validSlugs.has(k));

    if (cols.length === 0) {
      const existing = await tenantQuery(ctx.schemaName, `SELECT * FROM ${tableIdent} WHERE id = $1`, [rowId]);
      return NextResponse.json({ row: existing.rows[0] ?? {} });
    }

    // Capture old row for on_field_change
    const oldResult = await tenantQuery(ctx.schemaName, `SELECT * FROM ${tableIdent} WHERE id = $1`, [rowId]);
    const oldRow = oldResult.rows[0];

    const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`);
    const params = [...cols.map(c => data[c]), rowId];
    const result = await tenantQuery(ctx.schemaName, `UPDATE ${tableIdent} SET ${sets.join(',')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
    if (!result.rows.length) return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    const updatedRow = result.rows[0];

    await fireWorkflows(ctx.schemaName, tenantSlug, 'on_update', tableId, tableSlug, updatedRow, oldRow);
    await fireWorkflows(ctx.schemaName, tenantSlug, 'on_field_change', tableId, tableSlug, updatedRow, oldRow);
    return NextResponse.json({ row: updatedRow });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const rowId = searchParams.get('rowId');
  if (!tenantSlug || !tableId || !rowId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'delete');
  if (ctx instanceof NextResponse) return ctx;

  try {
    const tableMeta = await tenantQuery<{ slug: string }>(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
    if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    const tableIdent = ident(`ct_${tableMeta.rows[0].slug}`);
    await tenantQuery(ctx.schemaName, `DELETE FROM ${tableIdent} WHERE id = $1`, [rowId]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
