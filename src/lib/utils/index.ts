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

/** Safely evaluate a formula expression with field values substituted */
export function evaluateFormula(expression: string, values: Record<string, number>): number {
  // Replace field references with their values
  let expr = expression;
  for (const [key, value] of Object.entries(values)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(isNaN(value) ? 0 : value));
  }

  // Whitelist: only allow numbers, operators, parens, spaces
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    return 0;
  }

  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function(`return (${expr})`)());
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
