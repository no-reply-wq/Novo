/**
 * Expression engine public interface.
 *
 * Agent B implements this interface. No other agent calls the engine directly;
 * they import the interface from here and receive a concrete instance via DI.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExprScalar = string | number | boolean | null | Date;

export type ExprValue =
  | ExprScalar
  | ExprValue[]
  | { [key: string]: ExprValue };

/** Type-system representation — used by typeCheck(). */
export type ExprType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'null'
  | 'array'
  | 'object'
  | 'any';

/** A compiled, reusable expression (opaque handle returned by parse()). */
export interface CompiledExpr {
  readonly source: string;   // original expression string
  readonly resultType: ExprType;
}

/** Variables available to the expression at evaluation time. */
export interface ExprContext {
  /** The current row being evaluated. */
  record?: Record<string, ExprValue>;
  /** Related rows, keyed by relation id. */
  relations?: Record<string, Record<string, ExprValue>[]>;
  /** The current user. */
  user?: {
    id: string;
    email: string;
    roles: string[];
    locations: string[];
    [key: string]: ExprValue;
  };
  /** Page/query state variables (from the UI layer). */
  vars?: Record<string, ExprValue>;
  /** Named lookup tables (pre-fetched by the data layer). */
  tables?: Record<string, Record<string, ExprValue>[]>;
  /** Current timestamp (injected so expressions are deterministic in tests). */
  now?: Date;
}

export interface ParseError {
  message: string;
  position?: number;  // character offset in the source
  token?: string;
}

export interface TypeCheckResult {
  ok: boolean;
  inferredType: ExprType;
  errors: ParseError[];
  warnings: Array<{ message: string; position?: number }>;
}

// ─── Built-in function catalogue (informational, not enforced here) ──────────

/**
 * Minimum set of built-in functions Agent B must implement.
 *
 * Math:         SUM, AVG, MIN, MAX, ROUND, CEIL, FLOOR, ABS
 * Conditional:  IF, IFS, SWITCH, COALESCE, NULLIF
 * Text:         CONCAT, TRIM, UPPER, LOWER, LEFT, RIGHT, MID, LEN,
 *               REPLACE, CONTAINS, STARTS_WITH, ENDS_WITH, SPLIT, JOIN
 * Date:         DATE_DIFF, DATE_ADD, FORMAT_DATE, YEAR, MONTH, DAY,
 *               TODAY, NOW, WEEKDAY
 * Aggregation:  SUMIF, COUNTIF, AVGIF, COUNT, COUNT_DISTINCT
 *               (over a relation array in context.relations)
 * Lookup:       LOOKUP(relationId, filterExpr, fieldId)
 * Type:         TEXT, NUMBER, BOOLEAN, IS_NULL, IS_BLANK, TYPE_OF
 * Array:        FILTER, MAP, FIND, EVERY, SOME, FLAT, UNIQUE, SORT_BY
 * Auto-number:  SEQUENCE(sequenceId) — increments + returns next value
 */
export type BuiltinFunctionName = string; // open for Agent B to enumerate

// ─── Engine interface ─────────────────────────────────────────────────────────

export interface ExprEngine {
  /**
   * Parse and compile an expression string.
   * Throws ParseError[] when the source is syntactically invalid.
   * No network I/O — safe to call synchronously.
   */
  parse(source: string): CompiledExpr;

  /**
   * Type-check a compiled expression against a known schema.
   * fieldTypes maps field apiKey → ExprType (from the data layer).
   */
  typeCheck(expr: CompiledExpr, fieldTypes: Record<string, ExprType>): TypeCheckResult;

  /**
   * Evaluate a compiled expression in a context.
   * Never calls eval(). Pure — no side effects.
   * Resolves to null on a benign error (missing field, divide-by-zero).
   * Throws ExprEvalError only for security violations.
   */
  evaluate(expr: CompiledExpr, ctx: ExprContext): ExprValue;

  /**
   * Convenience: parse then evaluate in one call.
   * Throws ParseError[] on syntax errors; returns null on runtime errors.
   */
  evaluateSource(source: string, ctx: ExprContext): ExprValue;

  /**
   * Translate a row-filter expression into a Postgres WHERE clause fragment
   * and its bind parameters, so Agent C can embed it in RLS policies.
   *
   * The returned SQL must use $1, $2, … placeholders.
   * Returns null when the expression cannot be translated (fall back to
   * in-process evaluation).
   */
  toSql(expr: CompiledExpr, fieldTypes: Record<string, ExprType>): SqlFragment | null;
}

export interface SqlFragment {
  sql: string;
  params: ExprScalar[];
}

/** Thrown only on security violations (attempted code injection, etc.). */
export class ExprEvalError extends Error {
  constructor(
    message: string,
    public readonly source: string,
    public readonly ctx?: Partial<ExprContext>,
  ) {
    super(message);
    this.name = 'ExprEvalError';
  }
}

/** Thrown when parse() encounters a syntax error. */
export class ExprParseError extends Error {
  constructor(
    message: string,
    public readonly errors: ParseError[],
  ) {
    super(message);
    this.name = 'ExprParseError';
  }
}

// ─── DI token ─────────────────────────────────────────────────────────────────

/**
 * Singleton token for dependency injection.
 * Agent B exports a concrete implementation; callers import this symbol
 * and retrieve the instance from the platform container.
 *
 * Usage:
 *   const engine = container.get<ExprEngine>(EXPR_ENGINE);
 *   const result = engine.evaluateSource('SUM(lines.qty)', ctx);
 */
export const EXPR_ENGINE = Symbol('ExprEngine');
