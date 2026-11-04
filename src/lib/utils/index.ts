import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function formatCurrency(amount: number | string, currency = 'INR'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

export function generateDocNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Safe arithmetic expression evaluator — no `new Function`, no `eval`.
 * Supports: +  -  *  /  (  )  unary minus, integer and decimal literals,
 * and named field references (resolved from `values`).
 */
export function evaluateFormula(expression: string, values: Record<string, number>): number {
  // Substitute field references first
  let expr = expression;
  for (const [key, value] of Object.entries(values)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(isNaN(value) ? 0 : value));
  }

  // Tokenise
  const tokens: Array<{ type: 'num' | 'op' | 'lparen' | 'rparen'; value: string }> = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] ?? ''))) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'num', value: num });
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch }); i++;
    } else if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; }
    else if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; }
    else { return 0; } // unexpected character → safe fallback
  }

  // Recursive-descent parser: expr → term (('+' | '-') term)*
  //                           term → factor (('*' | '/') factor)*
  //                           factor → '-' factor | '(' expr ')' | NUM
  let pos = 0;

  function peek(): string | null { return pos < tokens.length ? tokens[pos].value : null; }
  function consume(): typeof tokens[number] { return tokens[pos++]; }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume().value;
      const right = parseFactor();
      if (op === '/') left = right === 0 ? 0 : left / right;
      else left = left * right;
    }
    return left;
  }

  function parseFactor(): number {
    if (peek() === '-') { consume(); return -parseFactor(); }
    if (peek() === '(') {
      consume(); // '('
      const val = parseExpr();
      if (peek() === ')') consume(); // ')'
      return val;
    }
    const tok = tokens[pos];
    if (tok && tok.type === 'num') { consume(); return parseFloat(tok.value); }
    return 0;
  }

  try {
    const result = parseExpr();
    return isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/** Sum a numeric column across line items */
export function sumColumn(items: Record<string, unknown>[], key: string): number {
  return items.reduce((acc, item) => {
    const val = parseFloat(String(item[key] ?? 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
