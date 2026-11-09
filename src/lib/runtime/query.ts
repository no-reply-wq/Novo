/**
 * Query executor — runs QueryDefinition against the tenant's schema.
 */

import { tenantQuery } from '@/lib/db/client';
import type {
  QueryDefinition,
  QueryResult,
  Row,
  FilterGroup,
  FilterCondition,
  SortDef,
} from '@/types/runtime';

/**
 * Postgres identifiers (table/column names) can never be parameterized, so they
 * are interpolated into SQL. Every value that reaches that interpolation MUST
 * pass this allow-list first — unquoted lowercase identifier characters only —
 * or a crafted field like `id" OR 1=1 --` would break out. Returns a safely
 * double-quoted identifier; throws on anything outside the allow-list.
 */
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
function quoteIdent(name: string | undefined | null): string {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

export interface QueryExecuteOptions {
  page?: number;
  pageSize?: number;
  /** Runtime params that can be referenced in filter values */
  params?: Record<string, unknown>;
}

export async function executeQuery(
  def: QueryDefinition,
  schemaName: string,
  userId: string,
  options: QueryExecuteOptions = {},
): Promise<QueryResult> {
  const { page = 1, pageSize = def.limit ?? 50, params = {} } = options;

  if (def.type === 'table' && def.tableId) {
    return executeTableQuery(def, schemaName, userId, page, pageSize, params);
  }

  // script / connector — not fully implemented in this iteration
  return { data: [], total: 0, page, selectedRow: null };
}

// ─── Table query ──────────────────────────────────────────────────────────────

async function executeTableQuery(
  def: QueryDefinition,
  schemaName: string,
  _userId: string,
  page: number,
  pageSize: number,
  params: Record<string, unknown>,
): Promise<QueryResult> {
  const bindValues: unknown[] = [];
  const conditions: string[] = [];

  if (def.filters) {
    const filterSql = buildFilterSql(def.filters, bindValues, params);
    if (filterSql) conditions.push(filterSql);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = buildOrderClause(def.sort ?? []);
  const offset = (page - 1) * pageSize;

  const dataIdx = bindValues.length + 1;
  const limitIdx = dataIdx;
  const offsetIdx = dataIdx + 1;

  const dataSql = `
    SELECT * FROM "${schemaName}".${quoteIdent(def.tableId)}
    ${whereClause}
    ${orderClause}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  bindValues.push(pageSize, offset);

  const countBindValues = [...bindValues.slice(0, bindValues.length - 2)];
  const countSql = `
    SELECT COUNT(*) AS total FROM "${schemaName}".${quoteIdent(def.tableId)}
    ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    tenantQuery<Row>(schemaName, dataSql, bindValues),
    tenantQuery<{ total: string }>(schemaName, countSql, countBindValues),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const data = dataResult.rows;

  return {
    data,
    total,
    page,
    selectedRow: data[0] ?? null,
  };
}

// ─── SQL builders ─────────────────────────────────────────────────────────────

function buildFilterSql(
  group: FilterGroup,
  bindValues: unknown[],
  params: Record<string, unknown>,
): string {
  const parts = group.conditions.map((cond) => {
    if ('logic' in cond) {
      return `(${buildFilterSql(cond, bindValues, params)})`;
    }
    return buildConditionSql(cond, bindValues, params);
  });

  return parts.filter(Boolean).join(` ${group.logic.toUpperCase()} `);
}

function buildConditionSql(
  cond: FilterCondition,
  bindValues: unknown[],
  params: Record<string, unknown>,
): string {
  const col = quoteIdent(cond.field);
  const op = cond.operator;

  if (op === 'isNull') return `${col} IS NULL`;
  if (op === 'isNotNull') return `${col} IS NOT NULL`;

  const rawValue = resolveFilterValue(cond.value, params);

  if (op === 'in') {
    if (!Array.isArray(rawValue) || rawValue.length === 0) return 'FALSE';
    const placeholders = rawValue.map((v) => {
      bindValues.push(v);
      return `$${bindValues.length}`;
    });
    return `${col} IN (${placeholders.join(', ')})`;
  }

  bindValues.push(rawValue);
  const idx = bindValues.length;
  const placeholder = `$${idx}`;

  switch (op) {
    case 'eq': return `${col} = ${placeholder}`;
    case 'neq': return `${col} != ${placeholder}`;
    case 'lt': return `${col} < ${placeholder}`;
    case 'lte': return `${col} <= ${placeholder}`;
    case 'gt': return `${col} > ${placeholder}`;
    case 'gte': return `${col} >= ${placeholder}`;
    case 'contains': {
      bindValues[bindValues.length - 1] = `%${rawValue}%`;
      return `${col} ILIKE ${placeholder}`;
    }
    case 'startsWith': {
      bindValues[bindValues.length - 1] = `${rawValue}%`;
      return `${col} ILIKE ${placeholder}`;
    }
    default:
      return `${col} = ${placeholder}`;
  }
}

function resolveFilterValue(
  value: unknown,
  params: Record<string, unknown>,
): unknown {
  if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
    const key = value.slice(2, -2).trim();
    return params[key] ?? null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    '__expr' in value
  ) {
    const key = (value as { __expr: string }).__expr;
    return params[key] ?? null;
  }
  return value ?? null;
}

function buildOrderClause(sort: SortDef[]): string {
  if (sort.length === 0) return '';
  const parts = sort.map((s) => `${quoteIdent(s.field)} ${s.direction === 'desc' ? 'DESC' : 'ASC'}`);
  return `ORDER BY ${parts.join(', ')}`;
}
