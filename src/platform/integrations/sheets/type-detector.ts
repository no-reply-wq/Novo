/**
 * Auto-detects field types from column names and sample values.
 */

// Regexes
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$|^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function isNonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function allMatch(values: unknown[], re: RegExp): boolean {
  const nonempty = values.filter(isNonEmpty);
  return nonempty.length > 0 && nonempty.every((v) => re.test(String(v).trim()));
}

function colContains(name: string, ...words: string[]): boolean {
  const lower = name.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function colEndsWith(name: string, ...words: string[]): boolean {
  const lower = name.toLowerCase();
  return words.some((w) => lower.endsWith(w));
}

function colStartsWith(name: string, ...words: string[]): boolean {
  const lower = name.toLowerCase();
  return words.some((w) => lower.startsWith(w));
}

/**
 * Detect the Novo field type for a column given its name and sampled values.
 *
 * Priority (highest first):
 *   1. Column-name hints for currency, integer, date
 *   2. Value-pattern matching: integer, decimal, date, email, phone
 *   3. Low-cardinality check → dropdown
 *   4. Default → text
 */
export function detectFieldType(
  columnName: string,
  values: unknown[]
): { type: string; options?: string[] } {
  // ── 1. Column-name hints ─────────────────────────────────────────────────────
  if (colContains(columnName, 'amount', 'price', 'rate', 'cost')) {
    return { type: 'currency' };
  }

  if (colContains(columnName, 'qty', 'quantity', 'count', 'nos')) {
    return { type: 'integer' };
  }

  if (
    colEndsWith(columnName, 'date') ||
    colStartsWith(columnName, 'date')
  ) {
    return { type: 'date' };
  }

  // ── 2. Value-pattern matching ─────────────────────────────────────────────────
  const nonempty = values.filter(isNonEmpty);

  if (nonempty.length === 0) {
    return { type: 'text' };
  }

  if (allMatch(values, DATE_RE)) {
    return { type: 'date' };
  }

  if (allMatch(values, EMAIL_RE)) {
    return { type: 'email' };
  }

  if (allMatch(values, PHONE_RE)) {
    return { type: 'phone' };
  }

  if (allMatch(values, INTEGER_RE)) {
    return { type: 'integer' };
  }

  if (allMatch(values, DECIMAL_RE)) {
    return { type: 'decimal' };
  }

  // ── 3. Low-cardinality → dropdown ────────────────────────────────────────────
  const stringValues = nonempty.map((v) => String(v).trim());
  const unique = Array.from(new Set(stringValues));
  const hasRepeats = unique.length < nonempty.length;

  if (unique.length <= 10 && hasRepeats) {
    return { type: 'dropdown', options: unique.sort() };
  }

  // ── 4. Default ───────────────────────────────────────────────────────────────
  return { type: 'text' };
}
