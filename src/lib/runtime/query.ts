/**
 * Query executor — runs QueryDefinition against the tenant's schema.
 */

import { tenantQuery, pgPool } from '@/lib/db/client';
import { enforceAccess } from '@/platform/access/runtime-check';
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
  /**
   * User roles for RLS context injection. When provided along with userId,
   * the query runs inside a transaction with SET LOCAL GUC variables that
   * the Postgres RLS policies read via current_setting().
   * If absent, no RLS context is injected (open access — legacy behaviour).
   */
  roles?: string[];
  /** Location ids the user belongs to (ancestors included) for RLS. */
  locations?: string[];
}

export async function executeQuery(
  def: QueryDefinition,
  schemaName: string,
  userId: string,
  options: QueryExecuteOptions = {},
): Promise<QueryResult> {
  const { page = 1, pageSize = def.limit ?? 50, params = {}, roles, locations } = options;

  if (def.type === 'table' && def.tableId) {
    return executeTableQuery(def, schemaName, userId, page, pageSize, params, roles, locations);
  }

  // script / connector — not fully implemented in this iteration
  return { data: [], total: 0, page, selectedRow: null };
}

// ─── Table query ──────────────────────────────────────────────────────────────

async function executeTableQuery(
  def: QueryDefinition,
  schemaName: string,
  userId: string,
  page: number,
  pageSize: number,
  params: Record<string, unknown>,
  roles?: string[],
  locations?: string[],
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

  // When roles/locations are provided, inject RLS context GUC variables so that
  // Postgres row-level security policies can filter rows via current_setting().
  // This runs both queries inside a single transaction with SET LOCAL so the GUCs
  // are automatically cleared when the transaction ends.
  if (roles !== undefined && locations !== undefined) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await enforceAccess(client, schemaName, userId, roles, locations);

      const [dataResult, countResult] = await Promise.all([
        client.query<Row>(dataSql, bindValues),
        client.query<{ total: string }>(countSql, countBindValues),
      ]);

      await client.query('COMMIT');

      const total = Number(countResult.rows[0]?.total ?? 0);
      const data = dataResult.rows;
      return { data, total, page, selectedRow: data[0] ?? null };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // No RLS context — legacy path (preserves existing behaviour when caller does
  // not supply roles/locations, e.g. server-side builder queries).
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
