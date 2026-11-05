/**
 * Type-conversion and type-inspection functions:
 * TEXT, NUMBER, BOOLEAN, IS_NULL, IS_BLANK, TYPE_OF
 */

import type { ExprValue } from '../index';

export const typeFunctions: Record<string, (args: ExprValue[]) => ExprValue> = {
  TEXT(args) {
    const v = args[0];
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof args[1] === 'string') {
      // Basic format support: "0000" for zero-padded integer
      const fmt = args[1];
      if (/^0+$/.test(fmt) && typeof v === 'number') {
        return String(Math.floor(v)).padStart(fmt.length, '0');
      }
    }
    return String(v);
  },
  NUMBER(args) {
    const v = args[0];
    if (typeof v === 'number') return v;
    if (v === null || v === '' || v === undefined) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    return n;
  },
  BOOLEAN(args) {
    const v = args[0];
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') {
      const lower = v.toLowerCase().trim();
      return lower !== '' && lower !== 'false' && lower !== '0';
    }
    return Boolean(v);
  },
  IS_NULL(args) {
    return args[0] === null || args[0] === undefined;
  },
  IS_BLANK(args) {
    const v = args[0];
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    return false;
  },
  TYPE_OF(args) {
    const v = args[0];
    if (v === null) return 'null';
    if (v instanceof Date) return 'date';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    return typeof v; // 'string' | 'number' | 'boolean'
  },
};
