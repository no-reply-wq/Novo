/**
 * Rollup engine — aggregate child rows with optional filter expression.
 *
 * Supports: SUM, COUNT, AVG, MIN, MAX
 * Optional WHERE filter using the expression evaluator (SUM-IF pattern).
 */

import { PoolClient } from 'pg';
import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';
import type { RollupField } from './types';

/**
 * Compute a rollup value for the given parent record.
 *
 * @param rollupDef - the rollup field definition
 * @param parentId  - UUID of the parent record
 * @param db        - Postgres client (must be inside a transaction or pool)
 * @param tenantSchema - tenant schema name
 * @param childTableApiKey - the child table's SQL name
 * @param foreignKeyColumn - the FK column on the child table pointing to parent
 * @returns aggregated number or null
 */
export async function computeRollup(
  rollupDef: RollupField,
  parentId: string,
  db: PoolClient,
  tenantSchema: string,
  childTableApiKey: string,
  foreignKeyColumn: string,
): Promise<number | null> {
  const opts = rollupDef.options;
  const { aggregation, sourceFieldId, filterExpr } = opts;

  const schema  = pgIdent(tenantSchema);
  const table   = pgIdent(childTableApiKey);
  const srcCol  = pgIdent(sourceFieldId);
  const fkCol   = pgIdent(foreignKeyColumn);

  // If there's a filter expression, fetch candidate rows and filter in-process
  if (filterExpr) {
    return computeRollupWithFilter(
      db, schema, table, srcCol, fkCol, parentId, aggregation, filterExpr,
    );
  }

  // No filter — push aggregation into SQL for performance
  const aggSql = buildAggSql(aggregation, srcCol);
  const sql =
    `SELECT ${aggSql} AS result ` +
    `FROM ${schema}.${table} ` +
    `WHERE ${fkCol} = $1::uuid ` +
    `AND deleted_at IS NULL`;

  try {
    const res = await db.query<{ result: string | null }>(sql, [parentId]);
    const raw = res.rows[0]?.result;
    return raw === null || raw === undefined ? null : Number(raw);
  } catch {
    return null;
  }
}

// ─── In-process rollup with expression filter ─────────────────────────────────

async function computeRollupWithFilter(
  db: PoolClient,
  schema: string,
  table: string,
  srcCol: string,
  fkCol: string,
  parentId: string,
  aggregation: RollupField['options']['aggregation'],
  filterExpr: string,
): Promise<number | null> {
  // Fetch all child rows
  const sql =
    `SELECT * FROM ${schema}.${table} ` +
    `WHERE ${fkCol} = $1::uuid ` +
    `AND deleted_at IS NULL`;

  let rows: Record<string, unknown>[];
  try {
    const res = await db.query(sql, [parentId]);
    rows = res.rows;
  } catch {
    return null;
  }

  // Parse filter expression once
  let filterAst: ReturnType<typeof parseExpression>;
  try {
    filterAst = parseExpression(filterExpr);
  } catch {
    return null;
  }

  // Apply filter
  const filtered = rows.filter(row => {
    const ctx: ExprContext = { record: row as Record<string, ExprValue> };
    try {
      return evaluateAST(filterAst, ctx) === true;
    } catch {
      return false;
    }
  });

  if (filtered.length === 0 && aggregation !== 'count') return null;

  // Extract the unquoted column name from pgIdent format "colname"
  const rawSrcCol = srcCol.replace(/^"|"$/g, '').replace(/""/g, '"');
  const values = filtered
    .map(r => r[rawSrcCol])
    .filter((v): v is number => typeof v === 'number');

  return applyAggregation(aggregation, values, filtered.length);
}

// ─── Pure aggregation helpers ─────────────────────────────────────────────────

function applyAggregation(
  aggregation: RollupField['options']['aggregation'],
  values: number[],
  totalCount: number,
): number | null {
  switch (aggregation) {
    case 'sum':   return values.reduce((a, b) => a + b, 0);
    case 'count': return totalCount;
    case 'avg':   return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':   return values.length === 0 ? null : Math.min(...values);
    case 'max':   return values.length === 0 ? null : Math.max(...values);
    case 'count_distinct': {
      const unique = new Set(values);
      return unique.size;
    }
  }
}

function buildAggSql(
  aggregation: RollupField['options']['aggregation'],
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
