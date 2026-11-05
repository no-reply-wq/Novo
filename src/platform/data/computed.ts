/**
 * Computed field resolver.
 *
 * resolveComputedFields() takes a raw DB row and evaluates all computed
 * fields (formula, rollup, lookup_value, status_from_rules) server-side,
 * returning a fully-resolved record.
 *
 * The ExprEngine is injected so we never import the concrete implementation.
 */

import { Pool } from 'pg';
import type {
  TableDef,
  FieldDef,
  FormulaFieldOptions,
  RollupFieldOptions,
  LookupValueFieldOptions,
  StatusFromRulesOptions,
} from '@/platform/contracts';
import type { ExprEngine, ExprContext, ExprValue } from '@/platform/expr';

export type RawRow = Record<string, unknown>;
export type ResolvedRecord = Record<string, ExprValue>;

/**
 * Evaluates every computed field on rawRow and merges the results in.
 *
 * @param pool        - Postgres pool for rollup SQL queries
 * @param schema      - tenant schema name (e.g. "tenant_colorplas")
 * @param tableDef    - definition of the table this row belongs to
 * @param rawRow      - the raw DB row (computed fields absent or null)
 * @param ctx         - ExprContext (user, vars, etc.)
 * @param exprEngine  - injected expression engine
 */
export async function resolveComputedFields(
  pool: Pool,
  schema: string,
  tableDef: TableDef,
  rawRow: RawRow,
  ctx: ExprContext,
  exprEngine: ExprEngine,
): Promise<ResolvedRecord> {
  const record: ResolvedRecord = {};

  // Seed with raw columns (cast unknown → ExprValue)
  for (const [k, v] of Object.entries(rawRow)) {
    record[k] = v as ExprValue;
  }

  // Build a row-local ExprContext that includes the raw values
  const rowCtx: ExprContext = {
    ...ctx,
    record,
  };

  for (const field of tableDef.fields) {
    switch (field.type) {
      case 'formula':
        record[field.apiKey] = resolveFormula(field, rowCtx, exprEngine);
        break;

      case 'rollup':
        record[field.apiKey] = await resolveRollup(pool, schema, tableDef, field, rawRow);
        break;

      case 'lookup_value':
        record[field.apiKey] = await resolveLookupValue(pool, schema, tableDef, field, rawRow);
        break;

      case 'status_from_rules':
        record[field.apiKey] = resolveStatusFromRules(field, rowCtx, exprEngine);
        break;

      default:
        // Not a computed field — raw value already set above
        break;
    }
  }

  return record;
}

// ─── Formula ──────────────────────────────────────────────────────────────────

function resolveFormula(
  field: FieldDef,
  ctx: ExprContext,
  exprEngine: ExprEngine,
): ExprValue {
  const opts = field.options as FormulaFieldOptions | undefined;
  if (!opts?.expression) return null;

  try {
    return exprEngine.evaluateSource(opts.expression, ctx);
  } catch {
    return null;
  }
}

// ─── Rollup ───────────────────────────────────────────────────────────────────

async function resolveRollup(
  pool: Pool,
  schema: string,
  tableDef: TableDef,
  field: FieldDef,
  rawRow: RawRow,
): Promise<ExprValue> {
  const opts = field.options as RollupFieldOptions | undefined;
  if (!opts) return null;

  // Resolve the relation
  const relation = tableDef.relations.find(r => r.id === opts.sourceRelationId);
  if (!relation) return null;

  const relatedTable = relation.targetTableId; // apiKey of related table
  const fkFieldId    = relation.foreignKeyFieldId;
  if (!fkFieldId) return null;

  // Find the FK column name on the related table
  // TODO: We need the related TableDef to find the FK column name.
  // For now we use the fkFieldId as the column name directly.
  // The Lead or Agent C should provide a table registry for cross-table lookups.
  const fkColumn = fkFieldId;
  const srcColumn = opts.sourceFieldId;
  const recordId  = rawRow['id'] as string;

  const aggFn = aggregationToSql(opts.aggregation, srcColumn);
  const s = pgIdent(schema);
  const t = pgIdent(relatedTable);

  try {
    const res = await pool.query<{ result: string | null }>(
      `SELECT ${aggFn} AS result
         FROM ${s}.${t}
        WHERE ${pgIdent(fkColumn)} = $1::uuid
          AND deleted_at IS NULL`,
      [recordId],
    );
    const val = res.rows[0]?.result ?? null;
    return val === null ? null : Number(val);
  } catch {
    return null;
  }
}

function aggregationToSql(agg: RollupFieldOptions['aggregation'], col: string): string {
  const c = pgIdent(col);
  switch (agg) {
    case 'sum':            return `COALESCE(SUM(${c}), 0)`;
    case 'count':          return `COUNT(*)`;
    case 'avg':            return `AVG(${c})`;
    case 'min':            return `MIN(${c})`;
    case 'max':            return `MAX(${c})`;
    case 'count_distinct': return `COUNT(DISTINCT ${c})`;
  }
}

// ─── Lookup value ─────────────────────────────────────────────────────────────

async function resolveLookupValue(
  pool: Pool,
  schema: string,
  tableDef: TableDef,
  field: FieldDef,
  rawRow: RawRow,
): Promise<ExprValue> {
  const opts = field.options as LookupValueFieldOptions | undefined;
  if (!opts) return null;

  // Find the FK field on this table
  const fkField = tableDef.fields.find(f => f.id === opts.relationId);
  if (!fkField) return null;

  const fkValue = rawRow[fkField.apiKey];
  if (!fkValue) return null;

  // Find the related table
  const relation = tableDef.relations.find(
    r => r.foreignKeyFieldId === opts.relationId,
  );
  if (!relation) return null;

  const relatedTable = relation.targetTableId;
  const s = pgIdent(schema);
  const t = pgIdent(relatedTable);
  const srcCol = pgIdent(opts.sourceFieldId);

  try {
    const res = await pool.query<{ val: unknown }>(
      `SELECT ${srcCol} AS val FROM ${s}.${t} WHERE id = $1::uuid LIMIT 1`,
      [fkValue],
    );
    return (res.rows[0]?.val ?? null) as ExprValue;
  } catch {
    return null;
  }
}

// ─── Status from rules ────────────────────────────────────────────────────────

function resolveStatusFromRules(
  field: FieldDef,
  ctx: ExprContext,
  exprEngine: ExprEngine,
): ExprValue {
  const opts = field.options as StatusFromRulesOptions | undefined;
  if (!opts) return null;

  const sorted = [...opts.rules].sort((a, b) => a.rank - b.rank);

  for (const rule of sorted) {
    try {
      const result = exprEngine.evaluateSource(rule.condition, ctx);
      if (result === true) return rule.label;
    } catch {
      // skip failed rule
    }
  }

  return opts.defaultStatus;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
