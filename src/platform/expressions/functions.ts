/**
 * Built-in function library for the Novo expression engine.
 *
 * Security: pure module — no I/O, no dynamic code execution.
 * No eval(), Function(), new Function().
 *
 * Covers:
 *   Math:        ROUND, FLOOR, CEIL, ABS, MIN, MAX, SUM, COUNT, AVG
 *   String:      CONCAT, UPPER, LOWER, TRIM, LEN, LEFT, RIGHT, CONTAINS, STARTS_WITH
 *   Logic:       IF, IFS, AND, OR, NOT, COALESCE, ISBLANK
 *   Date:        TODAY, NOW, YEAR, MONTH, DAY, DATEDIFF, DATEADD, FORMAT_DATE
 *   Indian biz:  FORMAT_INR, AMOUNT_IN_WORDS, GST_SPLIT
 */

export type ExprPrimitive = string | number | boolean | null | Date;
export type ExprVal = ExprPrimitive | ExprVal[] | { [k: string]: ExprVal };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: ExprVal): number {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toStr(v: ExprVal): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toDate(v: ExprVal, fn: string): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number') return new Date(v);
  throw new Error(`${fn}: expected a date value, got ${typeof v}`);
}

function flattenNums(args: ExprVal[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const item of a) {
        if (item !== null && item !== undefined) out.push(toNum(item));
      }
    } else if (a !== null && a !== undefined) {
      out.push(toNum(a));
    }
  }
  return out;
}

// ─── SUM / COUNT / AVG with optional field extraction ─────────────────────────

function extractField(arr: ExprVal, field?: ExprVal): number[] {
  if (!Array.isArray(arr)) return [];
  const nums: number[] = [];
  for (const row of arr) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row) && !(row instanceof Date)) {
      const f = typeof field === 'string' ? field : null;
      const val = f ? (row as Record<string, ExprVal>)[f] : null;
      if (val !== null && val !== undefined) nums.push(toNum(val));
    } else {
      nums.push(toNum(row));
    }
  }
  return nums;
}

// ─── Indian number formatting ─────────────────────────────────────────────────

/**
 * Format a number in Indian locale with ₹ prefix.
 * Example: 1234567.89 → ₹12,34,567.89
 */
function formatINR(n: number): string {
  if (!isFinite(n)) return '₹0.00';

  const isNegative = n < 0;
  const abs = Math.abs(n);
  const [intPart, decPart = '00'] = abs.toFixed(2).split('.');

  // Indian grouping: last 3 digits, then groups of 2
  let result = '';
  const digits = intPart;
  const len = digits.length;
  if (len <= 3) {
    result = digits;
  } else {
    result = digits.slice(0, len - 3);
    // group remaining in pairs from left
    const rem = result;
    const groups: string[] = [];
    let r = rem;
    while (r.length > 2) {
      groups.unshift(r.slice(-2));
      r = r.slice(0, -2);
    }
    if (r.length > 0) groups.unshift(r);
    result = groups.join(',') + ',' + digits.slice(len - 3);
  }

  return (isNegative ? '-₹' : '₹') + result + '.' + decPart;
}

// ─── Amount in words (Indian numbering) ───────────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function wordsBelowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = TENS[Math.floor(n / 10)] ?? '';
  const o = ONES[n % 10] ?? '';
  return o ? t + ' ' + o : t;
}

function wordsBelow1000(n: number): string {
  if (n < 100) return wordsBelowHundred(n);
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const hundreds = (ONES[h] ?? '') + ' Hundred';
  return rem === 0 ? hundreds : hundreds + ' ' + wordsBelowHundred(rem);
}

function amountInWords(n: number): string {
  if (!isFinite(n)) return 'Zero';
  const int = Math.floor(Math.abs(n));
  if (int === 0) return 'Zero';

  const crore    = Math.floor(int / 10_000_000);
  const lakh     = Math.floor((int % 10_000_000) / 100_000);
  const thousand = Math.floor((int % 100_000) / 1_000);
  const rest     = int % 1_000;

  const parts: string[] = [];
  if (crore    > 0) parts.push(wordsBelow1000(crore)    + ' Crore');
  if (lakh     > 0) parts.push(wordsBelow1000(lakh)     + ' Lakh');
  if (thousand > 0) parts.push(wordsBelow1000(thousand) + ' Thousand');
  if (rest     > 0) parts.push(wordsBelow1000(rest));

  const prefix = n < 0 ? 'Minus ' : '';
  return prefix + parts.join(' ');
}

// ─── GST split ────────────────────────────────────────────────────────────────

interface GSTResult {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

function gstSplit(amount: number, rate: number, type: string): GSTResult {
  const taxAmount = (amount * rate) / 100;
  const total = amount + taxAmount;
  if (type === 'inter' || type === 'igst') {
    return { cgst: 0, sgst: 0, igst: round2(taxAmount), total: round2(total) };
  }
  // intra: split equally into CGST + SGST
  const half = round2(taxAmount / 2);
  return { cgst: half, sgst: half, igst: 0, total: round2(total) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Function table ───────────────────────────────────────────────────────────

export type BuiltinFn = (args: ExprVal[], now: Date) => ExprVal;

export const BUILTIN_FUNCTIONS: Record<string, BuiltinFn> = {
  // ── Math ──────────────────────────────────────────────────────────────────
  ROUND(args) {
    const n = toNum(args[0]);
    const d = args[1] !== undefined ? toNum(args[1]) : 0;
    const f = Math.pow(10, Math.round(d));
    return Math.round(n * f) / f;
  },
  FLOOR(args) { return Math.floor(toNum(args[0])); },
  CEIL(args)  { return Math.ceil(toNum(args[0])); },
  ABS(args)   { return Math.abs(toNum(args[0])); },
  MIN(args)   {
    const nums = flattenNums(args);
    return nums.length === 0 ? null : Math.min(...nums);
  },
  MAX(args)   {
    const nums = flattenNums(args);
    return nums.length === 0 ? null : Math.max(...nums);
  },
  SUM(args) {
    const nums = Array.isArray(args[0]) ? extractField(args[0], args[1]) : flattenNums(args);
    return nums.reduce((a, b) => a + b, 0);
  },
  COUNT(args) {
    const target = args[0];
    if (Array.isArray(target)) return target.length;
    return args.filter(a => a !== null && a !== undefined).length;
  },
  AVG(args) {
    const nums = Array.isArray(args[0]) ? extractField(args[0], args[1]) : flattenNums(args);
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },

  // ── String ────────────────────────────────────────────────────────────────
  CONCAT(args)       { return args.map(toStr).join(''); },
  UPPER(args)        { return toStr(args[0]).toUpperCase(); },
  LOWER(args)        { return toStr(args[0]).toLowerCase(); },
  TRIM(args)         { return toStr(args[0]).trim(); },
  LEN(args)          { return toStr(args[0]).length; },
  LEFT(args)         { return toStr(args[0]).slice(0, toNum(args[1])); },
  RIGHT(args)        {
    const s = toStr(args[0]);
    const n = toNum(args[1]);
    return s.slice(Math.max(0, s.length - n));
  },
  CONTAINS(args)     { return toStr(args[0]).includes(toStr(args[1])); },
  STARTS_WITH(args)  { return toStr(args[0]).startsWith(toStr(args[1])); },

  // ── Logic ─────────────────────────────────────────────────────────────────
  // IF is handled lazily in evaluator; include here as fallback eager version
  IF(args) {
    return args[0] ? args[1] ?? null : args[2] ?? null;
  },
  IFS(args) {
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (args[i]) return args[i + 1] ?? null;
    }
    // If odd number of args, last is default
    if (args.length % 2 === 1) return args[args.length - 1] ?? null;
    return null;
  },
  AND(args) { return args.every(a => !!a); },
  OR(args)  { return args.some(a => !!a); },
  NOT(args) { return !args[0]; },
  COALESCE(args) {
    for (const a of args) {
      if (a !== null && a !== undefined && a !== '') return a;
    }
    return null;
  },
  ISBLANK(args) {
    const v = args[0];
    return v === null || v === undefined || v === '' ||
      (typeof v === 'string' && v.trim() === '');
  },

  // ── Date ──────────────────────────────────────────────────────────────────
  TODAY(_args, now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  },
  NOW(_args, now) { return new Date(now); },
  YEAR(args)  { return toDate(args[0], 'YEAR').getFullYear(); },
  MONTH(args) { return toDate(args[0], 'MONTH').getMonth() + 1; },
  DAY(args)   { return toDate(args[0], 'DAY').getDate(); },
  DATEDIFF(args) {
    const d1 = toDate(args[0], 'DATEDIFF');
    const d2 = toDate(args[1], 'DATEDIFF');
    const unit = typeof args[2] === 'string' ? args[2].toLowerCase() : 'days';
    const ms = d1.getTime() - d2.getTime();
    switch (unit) {
      case 'years':   return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
      case 'months':  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
      case 'weeks':   return Math.floor(ms / (1000 * 60 * 60 * 24 * 7));
      case 'hours':   return Math.floor(ms / (1000 * 60 * 60));
      case 'minutes': return Math.floor(ms / (1000 * 60));
      case 'seconds': return Math.floor(ms / 1000);
      default:        return Math.floor(ms / (1000 * 60 * 60 * 24)); // days
    }
  },
  DATEADD(args) {
    const d = new Date(toDate(args[0], 'DATEADD'));
    const n = toNum(args[1]);
    const unit = typeof args[2] === 'string' ? args[2].toLowerCase() : 'days';
    switch (unit) {
      case 'years':   d.setFullYear(d.getFullYear() + n); break;
      case 'months':  d.setMonth(d.getMonth() + n); break;
      case 'weeks':   d.setDate(d.getDate() + n * 7); break;
      case 'hours':   d.setHours(d.getHours() + n); break;
      case 'minutes': d.setMinutes(d.getMinutes() + n); break;
      case 'seconds': d.setSeconds(d.getSeconds() + n); break;
      default:        d.setDate(d.getDate() + n); break;
    }
    return d;
  },
  FORMAT_DATE(args) {
    const d = toDate(args[0], 'FORMAT_DATE');
    const fmt = typeof args[1] === 'string' ? args[1] : 'YYYY-MM-DD';
    return fmt
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD',   String(d.getDate()).padStart(2, '0'))
      .replace('HH',   String(d.getHours()).padStart(2, '0'))
      .replace('mm',   String(d.getMinutes()).padStart(2, '0'))
      .replace('ss',   String(d.getSeconds()).padStart(2, '0'));
  },

  // ── Indian business ───────────────────────────────────────────────────────
  FORMAT_INR(args) {
    return formatINR(toNum(args[0]));
  },
  AMOUNT_IN_WORDS(args) {
    return amountInWords(toNum(args[0]));
  },
  GST_SPLIT(args) {
    const amount = toNum(args[0]);
    const rate   = toNum(args[1]);
    const type   = typeof args[2] === 'string' ? args[2] : 'intra';
    return gstSplit(amount, rate, type) as unknown as ExprVal;
  },
};

export const FUNCTION_NAMES = Object.keys(BUILTIN_FUNCTIONS);
