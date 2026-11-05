/**
 * Text functions: CONCAT, TRIM, UPPER, LOWER, LEFT, RIGHT, MID, LEN,
 *                REPLACE, CONTAINS, STARTS_WITH, ENDS_WITH, SPLIT, JOIN
 */

import { ExprEvalError } from '../index';
import type { ExprValue } from '../index';

const MAX_STRING = 100_000;

function str(v: ExprValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function checkLen(s: string, fn: string): string {
  if (s.length > MAX_STRING) {
    throw new ExprEvalError(`${fn}: result string exceeds max length (${MAX_STRING})`, fn);
  }
  return s;
}

export const textFunctions: Record<string, (args: ExprValue[]) => ExprValue> = {
  CONCAT(args) {
    const result = args.map(str).join('');
    return checkLen(result, 'CONCAT');
  },
  TRIM(args) {
    return str(args[0]).trim();
  },
  UPPER(args) {
    return str(args[0]).toUpperCase();
  },
  LOWER(args) {
    return str(args[0]).toLowerCase();
  },
  LEFT(args) {
    const s = str(args[0]);
    const n = typeof args[1] === 'number' ? Math.max(0, args[1]) : 0;
    return s.slice(0, n);
  },
  RIGHT(args) {
    const s = str(args[0]);
    const n = typeof args[1] === 'number' ? Math.max(0, args[1]) : 0;
    return s.slice(Math.max(0, s.length - n));
  },
  MID(args) {
    const s = str(args[0]);
    const start = typeof args[1] === 'number' ? args[1] - 1 : 0; // 1-indexed
    const len = typeof args[2] === 'number' ? args[2] : s.length;
    return s.substr(Math.max(0, start), len);
  },
  LEN(args) {
    return str(args[0]).length;
  },
  REPLACE(args) {
    const s = str(args[0]);
    const search = str(args[1]);
    const replacement = str(args[2]);
    if (!search) return s;
    const result = s.split(search).join(replacement);
    return checkLen(result, 'REPLACE');
  },
  CONTAINS(args) {
    return str(args[0]).includes(str(args[1]));
  },
  STARTS_WITH(args) {
    return str(args[0]).startsWith(str(args[1]));
  },
  ENDS_WITH(args) {
    return str(args[0]).endsWith(str(args[1]));
  },
  SPLIT(args) {
    const s = str(args[0]);
    const sep = str(args[1]);
    if (!sep) return [s];
    return s.split(sep);
  },
  JOIN(args) {
    const arr = args[0];
    const sep = str(args[1] ?? ',');
    if (!Array.isArray(arr)) return str(arr);
    const result = arr.map(str).join(sep);
    return checkLen(result, 'JOIN');
  },
};
