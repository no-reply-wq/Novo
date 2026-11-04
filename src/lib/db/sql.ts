/**
 * Safe SQL identifier helpers.
 * ALL dynamic identifiers (table names, column names, schema names) must
 * go through these helpers. Values always go through $n parameters.
 */

const IDENT_RE = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Validate and double-quote a SQL identifier (table, column, schema name).
 * Throws if the value is not a valid lowercase identifier.
 */
export function ident(value: unknown): string {
  if (typeof value !== 'string' || !IDENT_RE.test(value)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(value)}`);
  }
  return `"${value}"`;
}

/**
 * Assert that a table name is in the allowed set, then return it quoted.
 * Use for table names coming from user input.
 */
export function assertTable(name: string, allowed: Set<string>): string {
  if (!allowed.has(name)) {
    throw new Error(`Table not allowed: ${JSON.stringify(name)}`);
  }
  return ident(name);
}

/**
 * Assert that a column name is in the allowed set, then return it quoted.
 * Use for sort/filter column names coming from user input.
 */
export function assertColumn(name: string, allowed: Set<string>): string {
  if (!allowed.has(name)) {
    throw new Error(`Column not allowed: ${JSON.stringify(name)}`);
  }
  return ident(name);
}

/**
 * Clamp an integer value to [min, max].
 * Throws if the value cannot be parsed as an integer.
 */
export function clampInt(
  value: unknown,
  min = 1,
  max = 1000,
  defaultValue = min
): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isInteger(n)) return defaultValue;
  return Math.max(min, Math.min(max, n));
}

/** Allowed aggregate functions */
export const ALLOWED_AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

/** Allowed sort directions */
export const ALLOWED_SORT_DIRS = new Set(['asc', 'desc']);

/** Allowed filter operators */
export const ALLOWED_OPERATORS = new Set(['=', '!=', '<', '>', '<=', '>=', 'like', 'ilike', 'in', 'not in', 'is null', 'is not null']);
