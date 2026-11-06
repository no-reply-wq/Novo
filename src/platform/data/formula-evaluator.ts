/**
 * Formula evaluator — data-layer facade over the expr engine.
 *
 * Provides per-row formula evaluation with:
 * - Safe AST-based evaluation (no eval / Function)
 * - Full function set: arithmetic, IF(), ROUND(), TODAY(), string concat
 * - Field references resolved from the row record
 * - SQL transpilation attempt (falls back to JS evaluation)
 * - Typed result (number, string, boolean, date, null)
 */

import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue, ExprType } from '@/platform/expr';
import type { FormulaFieldOptions } from '@/platform/contracts';
import { NotConfiguredError } from './errors';

// ─── Public types ─────────────────────────────────────────────────────────────

export type FormulaResult = ExprValue;

export interface FormulaEvalOptions {
  /** Current user context (user id, roles, locations). */
  user?: ExprContext['user'];
  /** Page/query state variables. */
  vars?: Record<string, ExprValue>;
  /** Named lookup tables (pre-fetched). */
  tables?: Record<string, Record<string, ExprValue>[]>;
  /** Deterministic now (for tests / audit). */
  now?: Date;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate a FormulaFieldOptions expression against a single row.
 *
 * Returns the typed result, or null on any benign error (parse failure,
 * missing field, division by zero, etc.).
 *
 * @param opts    - formula field options (expression + returnType)
 * @param row     - the current record values
 * @param evalOpts - optional context (user, vars, now)
 */
export function evaluateFormulaField(
  opts: FormulaFieldOptions,
  row: Record<string, unknown>,
  evalOpts: FormulaEvalOptions = {},
): FormulaResult {
  if (!opts.expression?.trim()) {
    throw new NotConfiguredError('formula.expression');
  }

  try {
    const ast = parseExpression(opts.expression);
    const ctx: ExprContext = {
      record: row as Record<string, ExprValue>,
      user: evalOpts.user,
      vars: evalOpts.vars,
      tables: evalOpts.tables,
      now: evalOpts.now ?? new Date(),
    };
    const result = evaluateAST(ast, ctx);
    return coerceToReturnType(result, opts.returnType);
  } catch {
    return null;
  }
}

/**
 * Evaluate a formula for a child (line-item) row.
 *
 * Child fields are available directly; parent fields under `parent.<field>`.
 *
 * @param opts      - formula field options
 * @param childRow  - the child/line record values
 * @param parentRow - the parent record values
 * @param evalOpts  - optional context
 */
export function evaluateLineFormulaField(
  opts: FormulaFieldOptions,
  childRow: Record<string, unknown>,
  parentRow: Record<string, unknown>,
  evalOpts: FormulaEvalOptions = {},
): FormulaResult {
  if (!opts.expression?.trim()) {
    throw new NotConfiguredError('formula.expression');
  }

  try {
    const ast = parseExpression(opts.expression);
    const ctx: ExprContext = {
      record: {
        ...(childRow as Record<string, ExprValue>),
        parent: parentRow as ExprValue,
      },
      user: evalOpts.user,
      vars: evalOpts.vars,
      tables: evalOpts.tables,
      now: evalOpts.now ?? new Date(),
    };
    const result = evaluateAST(ast, ctx);
    return coerceToReturnType(result, opts.returnType);
  } catch {
    return null;
  }
}

// ─── Type coercion ────────────────────────────────────────────────────────────

function coerceToReturnType(
  value: ExprValue,
  returnType: FormulaFieldOptions['returnType'],
): FormulaResult {
  if (value === null || value === undefined) return null;

  switch (returnType) {
    case 'number': {
      if (typeof value === 'number') return value;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'text':
      return String(value);
    case 'boolean':
      return Boolean(value);
    case 'date': {
      if (value instanceof Date) return value;
      if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    }
  }
}

// ─── SQL transpiler (best-effort) ─────────────────────────────────────────────

/**
 * Attempt to transpile a formula expression to a SQL expression.
 *
 * Returns null if the expression cannot be transpiled (JS fallback required).
 * This is used by the query engine to push computation into Postgres.
 *
 * @param opts      - formula field options
 * @param fieldTypes - map of fieldApiKey → ExprType for type-checking
 */
export function formulaToSql(
  opts: FormulaFieldOptions,
  fieldTypes: Record<string, ExprType>,
): string | null {
  if (!opts.expression?.trim()) return null;

  try {
    const ast = parseExpression(opts.expression);
    // The sql-transpiler is in the expr module; we import at runtime to allow
    // the transpiler to be absent in edge runtimes.
    const { toSql } = require('@/platform/expr/sql-transpiler') as {
      toSql: (ast: ReturnType<typeof parseExpression>, fieldTypes: Record<string, ExprType>) => { sql: string } | null;
    };
    const fragment = toSql(ast, fieldTypes);
    return fragment?.sql ?? null;
  } catch {
    return null;
  }
}
