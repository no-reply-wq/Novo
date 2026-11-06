import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { ident } from '@/lib/db/sql';

interface ReportColumn { field_slug: string; label: string; aggregate: string; }
interface ReportFilter { field_slug: string; operator: string; value: string; }

const ALLOWED_AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

const OPERATORS: Record<string, (fieldIdent: string, paramIdx: number, value: string) => { sql: string; param: unknown }> = {
  '=':        (f, i, v) => ({ sql: `${f}::text = $${i}`, param: v }),
  '!=':       (f, i, v) => ({ sql: `${f}::text != $${i}`, param: v }),
  '>':        (f, i, v) => ({ sql: `${f}::numeric > $${i}`, param: Number(v) }),
  '<':        (f, i, v) => ({ sql: `${f}::numeric < $${i}`, param: Number(v) }),
  '>=':       (f, i, v) => ({ sql: `${f}::numeric >= $${i}`, param: Number(v) }),
  '<=':       (f, i, v) => ({ sql: `${f}::numeric <= $${i}`, param: Number(v) }),
  'contains': (f, i, v) => ({ sql: `${f}::text ILIKE $${i}`, param: `%${v}%` }),
  'starts':   (f, i, v) => ({ sql: `${f}::text ILIKE $${i}`, param: `${v}%` }),
  'is_empty': (f, _i, _v) => ({ sql: `(${f} IS NULL OR ${f}::text = '')`, param: null }),
  'not_empty':(f, _i, _v) => ({ sql: `(${f} IS NOT NULL AND ${f}::text != '')`, param: null }),
};

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const format = searchParams.get('format') ?? 'json';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { table_id, table_slug, columns = [], filters = [], group_by = '', sort_by = 'created_at', sort_dir = 'desc', row_limit = 500 } = body;

  if (!table_slug) return NextResponse.json({ error: 'table_slug required' }, { status: 400 });

  // Validate table_slug and build safe table identifier
  let tableIdent: string;
  try {
    tableIdent = ident(`ct_${table_slug}`);
  } catch {
    return NextResponse.json({ error: 'Invalid table_slug' }, { status: 400 });
  }

  const cols = columns as ReportColumn[];
  const fltrs = filters as ReportFilter[];

  // Build safe group_by identifier (empty string means no grouping)
  let groupByIdent: string | null = null;
  if (group_by) {
    try {
      groupByIdent = ident(group_by);
    } catch {
      return NextResponse.json({ error: 'Invalid group_by field' }, { status: 400 });
    }
  }

  // Build SELECT clause
  let selectParts: string[] = [];
  const hasAggregate = cols.some(c => c.aggregate && c.aggregate !== 'none');

  if (cols.length === 0) {
    selectParts = ['*'];
  } else if (groupByIdent && hasAggregate) {
    // Grouped aggregation
    selectParts = [
      `${groupByIdent}::text as ${groupByIdent}`,
      ...cols
        .filter(c => c.field_slug !== group_by)
        .map(c => {
          let fieldI: string;
          try { fieldI = ident(c.field_slug); } catch { return null; }
          if (!c.aggregate || c.aggregate === 'none') return `${fieldI}::text as ${fieldI}`;
          if (c.aggregate === 'count') return `COUNT(${fieldI}) as ${ident(c.field_slug + '_count')}`;
          if (!ALLOWED_AGGREGATES.has(c.aggregate.toLowerCase())) return null;
          const agg = c.aggregate.toUpperCase();
          return `${agg}(${fieldI}::numeric) as ${ident(c.field_slug + '_' + c.aggregate)}`;
        })
        .filter((s): s is string => s !== null),
    ];
  } else {
    selectParts = cols
      .map(c => {
        let fieldI: string;
        try { fieldI = ident(c.field_slug); } catch { return null; }
        if (!c.aggregate || c.aggregate === 'none') return `${fieldI}::text as ${fieldI}`;
        if (c.aggregate === 'count') return `COUNT(*) as "total_count"`;
        if (!ALLOWED_AGGREGATES.has(c.aggregate.toLowerCase())) return null;
        const agg = c.aggregate.toUpperCase();
        return `${agg}(${fieldI}::numeric) as ${ident(c.field_slug + '_' + c.aggregate)}`;
      })
      .filter((s): s is string => s !== null);
  }

  if (selectParts.length === 0) selectParts = ['*'];

  // Build WHERE clause — pass already-quoted identifiers into OPERATORS
  const params: unknown[] = [];
  const whereParts: string[] = [];
  for (const f of fltrs) {
    if (!f.field_slug || !f.operator) continue;
    const opFn = OPERATORS[f.operator];
    if (!opFn) continue;
    let fieldI: string;
    try { fieldI = ident(f.field_slug); } catch { continue; }
    const { sql, param } = opFn(fieldI, params.length + 1, f.value);
    if (param !== null) { params.push(param); whereParts.push(sql); }
    else { whereParts.push(sql); }
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const groupClause = groupByIdent && hasAggregate ? `GROUP BY ${groupByIdent}` : '';

  // Safe sort field
  let sortFieldIdent: string;
  try {
    sortFieldIdent = sort_by && sort_by !== 'created_at' ? ident(sort_by) : (groupByIdent && hasAggregate ? groupByIdent : '"created_at"');
  } catch {
    sortFieldIdent = '"created_at"';
  }
  const sortClause = `ORDER BY ${sortFieldIdent} ${sort_dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`;

  params.push(Math.min(row_limit, 1000));
  const query = `SELECT ${selectParts.join(', ')} FROM ${tableIdent} ${whereClause} ${groupClause} ${sortClause} LIMIT $${params.length}`;

  try {
    const result = await tenantQuery(ctx.schemaName, query, params);
    const rows = result.rows;

    // Compute totals for numeric columns
    const totals: Record<string, unknown> = {};
    if (rows.length > 0) {
      const numericCols = Object.keys(rows[0]).filter(k => rows.every(r => r[k] === null || r[k] === undefined || !isNaN(Number(r[k]))));
      numericCols.forEach(col => {
        const sum = rows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
        totals[col] = Math.round(sum * 100) / 100;
      });
    }

    if (format === 'csv') {
      if (!rows.length) return new NextResponse('No data', { headers: { 'Content-Type': 'text/csv' } });
      const headers = Object.keys(rows[0]);
      const escape = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
      return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="report_${table_slug}_${new Date().toISOString().slice(0,10)}.csv"` } });
    }

    return NextResponse.json({ rows, totals, count: rows.length, query: process.env.NODE_ENV === 'development' ? query : undefined });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, query: process.env.NODE_ENV === 'development' ? query : undefined }, { status: 400 });
  }
}
