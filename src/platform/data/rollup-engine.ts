/**
 * Rollup engine — data-layer facade.
 *
 * Generates a SQL subquery for a rollup field given:
 *   - source table / field / relation path
 *   - aggregate function (SUM/COUNT/AVG/MIN/MAX/COUNT_DISTINCT)
 *   - optional filter expression (SUM-IF pattern)
 *
 * For filtered rollups the filter is applied in-process (JS) after fetching
 * the child rows, so arbitrary expression complexity is supported without
 * requiring a Postgres expression transpiler.
 *
 * Nested relation support: `relationPath` is an ordered list of relation IDs
 * resolved by the caller into (childTable, foreignKeyColumn) pairs before
 * calling `buildRollupSubquery`.
 */

import type { Pool, PoolClient } from 'pg';
import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';
import type { RollupFieldOptions } from '@/platform/contracts';
import { NotConfiguredError } from './errors';

// ─── Public types ─────────────────────────────────────────────────────────────

/** One hop in a relation path: child table sql name + FK column name. */
export interface RelationHop {
  /** The child table's apiKey (SQL table name without schema). */
  childTableApiKey: string;
  /** The FK column on the child table that points to the parent. */
  foreignKeyColumn: string;
}

export interface RollupOptions {
  opts: RollupFieldOptions;
  /** Resolved relation hops, outermost to innermost. For simple one-hop rollups, length === 1. */
  relationPath: RelationHop[];
  /** Tenant schema name (e.g. "tenant_colorplas"). */
  tenantSchema: string;
}

// ─── SQL subquery builder ─────────────────────────────────────────────────────

/**
 * Build a SQL subquery string that computes the rollup for a single parent id.
 *
 * Returns `null` when the rollup has a filter expression (must be evaluated
 * in-process — use `computeRollupValue` instead).
 *
 * The returned SQL uses a `$1` placeholder for the parent record id.
 *
 * @example
 * // SUM(amount) of related order_lines
 * buildRollupSubquery({
 *   opts: { aggregation: 'sum', sourceFieldId: 'amount', sourceRelationId: 'rel1' },
 *   relationPath: [{ childTableApiKey: 'order_lines', foreignKeyColumn: 'order_id' }],
 *   tenantSchema: 'tenant_acme',
 * })
 * // → 'SELECT COALESCE(SUM("amount"), 0) FROM "tenant_acme"."order_lines" WHERE "order_id" = $1::uuid AND deleted_at IS NULL'
 */
export function buildRollupSubquery(params: RollupOptions): string | null {
  const { opts, relationPath, tenantSchema } = params;

  if (!relationPath.length) {
    throw new NotConfiguredError('rollup.relationPath');
  }
  if (opts.filterExpr) {
    // Cannot push filter into SQL without a transpiler — caller must use computeRollupValue
    return null;
  }

  // For now we support single-hop (most common). Nested support joins tables.
  if (relationPath.length === 1) {
    const hop = relationPath[0];
    const schema = pgIdent(tenantSchema);
    const table  = pgIdent(hop.childTableApiKey);
    const fk     = pgIdent(hop.foreignKeyColumn);
    const srcCol = pgIdent(opts.sourceFieldId);
    const agg    = buildAggSql(opts.aggregation, srcCol);
    return (
      `SELECT ${agg} FROM ${schema}.${table} ` +
      `WHERE ${fk} = $1::uuid AND deleted_at IS NULL`
    );
  }

  // Multi-hop: generate a JOIN chain
  return buildMultiHopSubquery(params);
}

function buildMultiHopSubquery(params: RollupOptions): string {
  const { opts, relationPath, tenantSchema } = params;
  const schema = pgIdent(tenantSchema);
  const srcCol = pgIdent(opts.sourceFieldId);
  const agg    = buildAggSql(opts.aggregation, srcCol);

  // Build a chain: outermost table joins to inner tables via FK
  // t0 is the direct child of the parent; t_last holds the aggregated field.
  const aliases = relationPath.map((_, i) => `_t${i}`);

  const firstHop = relationPath[0];
  const firstAlias = aliases[0];
  let fromClause = `${schema}.${pgIdent(firstHop.childTableApiKey)} AS ${firstAlias}`;

  for (let i = 1; i < relationPath.length; i++) {
    const hop = relationPath[i];
    const prevAlias = aliases[i - 1];
    const curAlias  = aliases[i];
    fromClause += ` JOIN ${schema}.${pgIdent(hop.childTableApiKey)} AS ${curAlias}`;
    fromClause += ` ON ${curAlias}.${pgIdent(hop.foreignKeyColumn)} = ${prevAlias}.id`;
  }

  const lastAlias = aliases[aliases.length - 1];
  const firstFk   = pgIdent(firstHop.foreignKeyColumn);
  const aggExpr   = agg.replace(srcCol, `${lastAlias}.${srcCol}`);

  return (
    `SELECT ${aggExpr} FROM ${fromClause} ` +
    `WHERE ${firstAlias}.${firstFk} = $1::uuid ` +
    `AND ${firstAlias}.deleted_at IS NULL`
  );
}

// ─── In-process evaluator ─────────────────────────────────────────────────────

/**
 * Compute the rollup value for a single parent record.
 *
 * Uses in-process filter evaluation when `opts.filterExpr` is set,
 * otherwise delegates to a SQL query.
 *
 * @param params     - rollup options (relation path, schema, opts)
 * @param parentId   - UUID of the parent record
 * @param dbOrClient - Pool (for read-only) or PoolClient (inside a transaction)
 */
export async function computeRollupValue(
  params: RollupOptions,
  parentId: string,
  dbOrClient: Pool | PoolClient,
): Promise<number | null> {
  const { opts, relationPath, tenantSchema } = params;

  if (!relationPath.length) {
    throw new NotConfiguredError('rollup.relationPath');
  }

  const hop    = relationPath[0]; // outermost
  const schema = pgIdent(tenantSchema);
  const table  = pgIdent(hop.childTableApiKey);
  const fk     = pgIdent(hop.foreignKeyColumn);

  if (opts.filterExpr) {
    return computeWithFilter(
      dbOrClient, schema, table, fk, parentId,
      opts.aggregation, opts.sourceFieldId, opts.filterExpr,
    );
  }

  // No filter — push aggregation into SQL
  const sql = buildRollupSubquery(params);
  if (!sql) return null;

  try {
    const res = await (dbOrClient as Pool).query<{ result: string | null }>(
      sql,
      [parentId],
    );
    const raw = res.rows[0]?.result;
    return raw === null || raw === undefined ? null : Number(raw);
  } catch {
    return null;
  }
}

async function computeWithFilter(
  db: Pool | PoolClient,
  schema: string,
  table: string,
  fkCol: string,
  parentId: string,
  aggregation: RollupFieldOptions['aggregation'],
  sourceFieldId: string,
  filterExpr: string,
): Promise<number | null> {
  const fetchSql =
    `SELECT * FROM ${schema}.${table} ` +
    `WHERE ${fkCol} = $1::uuid AND deleted_at IS NULL`;

  let rows: Record<string, unknown>[];
  try {
    const res = await (db as Pool).query(fetchSql, [parentId]);
    rows = res.rows as Record<string, unknown>[];
  } catch {
    return null;
  }

  let filterAst: ReturnType<typeof parseExpression>;
  try {
    filterAst = parseExpression(filterExpr);
  } catch {
    return null;
  }

  const filtered = rows.filter(row => {
    const ctx: ExprContext = { record: row as Record<string, ExprValue> };
    try {
      return evaluateAST(filterAst, ctx) === true;
    } catch {
      return false;
    }
  });

  if (filtered.length === 0 && aggregation !== 'count') return null;

  const values = filtered
    .map(r => r[sourceFieldId])
    .filter((v): v is number => typeof v === 'number');

  return applyAggregation(aggregation, values, filtered.length);
}

// ─── Pure aggregation ─────────────────────────────────────────────────────────

function applyAggregation(
  aggregation: RollupFieldOptions['aggregation'],
  values: number[],
  totalCount: number,
): number | null {
  switch (aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'count':
      return totalCount;
    case 'avg':
      return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return values.length === 0 ? null : Math.min(...values);
    case 'max':
      return values.length === 0 ? null : Math.max(...values);
    case 'count_distinct': {
      const unique = new Set(values);
      return unique.size;
    }
  }
}

function buildAggSql(
  aggregation: RollupFieldOptions['aggregation'],
  col: string,
): string {
  switch (aggregation) {
    case 'sum':            return `COALESCE(SUM(${col}), 0)`;
    case 'count':          return `COUNT(*)`;
    case 'avg':            return `AVG(${col})`;
    case 'min':            return `MIN(${col})`;
    case 'max':            return `MAX(${col})`;
    case 'count_distinct': return `COUNT(DISTINCT ${col})`;
  }
}

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
