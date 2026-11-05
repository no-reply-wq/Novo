/**
 * Formula evaluator — per-row expression evaluation using the expr engine.
 *
 * Supports:
 * - Arithmetic, string concatenation, date diff
 * - IF/IFS, nested field access (lines[].qty)
 * - Per-line column support: qty*rate*(1-disc/100)*(1+gst/100)
 */

import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';
import type { TableSchema } from './types';

/**
 * Evaluate a formula expression against a row.
 *
 * @param expr        - formula expression string
 * @param row         - current record values
 * @param tableSchema - table definition (used for type context)
 * @param ctx         - optional extra context (user, vars, relations)
 * @returns           - scalar result or null on benign error
 */
export function evaluateFormula(
  expr: string,
  row: Record<string, unknown>,
  tableSchema: TableSchema,
  ctx: Partial<ExprContext> = {},
): unknown {
  try {
    const ast = parseExpression(expr);

    // Build relations map from the table schema's relation data if available
    const relations = ctx.relations ?? buildRelationsFromRow(row, tableSchema);

    const evalCtx: ExprContext = {
      record: row as Record<string, ExprValue>,
      relations,
      user: ctx.user,
      vars: ctx.vars,
      tables: ctx.tables,
      now: ctx.now ?? new Date(),
    };

    return evaluateAST(ast, evalCtx);
  } catch {
    return null;
  }
}

/**
 * Evaluate a formula expression on a child (line) row.
 *
 * Child rows can reference parent fields via parentRow, and all
 * arithmetic fields like qty*rate*(1-disc/100)*(1+gst/100) work normally.
 *
 * @param expr      - formula expression string
 * @param childRow  - the child/line row
 * @param parentRow - the parent record values
 * @param ctx       - optional extra context
 */
export function evaluateLineFormula(
  expr: string,
  childRow: Record<string, unknown>,
  parentRow: Record<string, unknown>,
  ctx: Partial<ExprContext> = {},
): unknown {
  try {
    const ast = parseExpression(expr);

    const evalCtx: ExprContext = {
      // Merge parent fields under a 'parent' key, child fields at root
      record: {
        ...(childRow as Record<string, ExprValue>),
        parent: parentRow as ExprValue,
      },
      user: ctx.user,
      vars: ctx.vars,
      tables: ctx.tables,
      now: ctx.now ?? new Date(),
    };

    return evaluateAST(ast, evalCtx);
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal relations map by scanning the row for array-valued keys.
 * When a row has `lines: [...]`, we expose it as relations.lines so that
 * expressions like `lines[].qty` resolve correctly.
 */
function buildRelationsFromRow(
  row: Record<string, unknown>,
  _tableSchema: TableSchema,
): Record<string, Record<string, ExprValue>[]> {
  const relations: Record<string, Record<string, ExprValue>[]> = {};

  for (const [key, val] of Object.entries(row)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      relations[key] = val as Record<string, ExprValue>[];
    }
  }

  return relations;
}
