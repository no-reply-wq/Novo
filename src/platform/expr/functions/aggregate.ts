/**
 * Aggregate / array functions:
 * SUMIF, COUNTIF, AVGIF, COUNT, COUNT_DISTINCT,
 * FILTER, MAP, FIND, EVERY, SOME, FLAT, UNIQUE, SORT_BY
 */

import { ExprEvalError } from '../index';
import type { ExprValue } from '../index';

const MAX_ARRAY = 10_000;

function checkArrayLen(arr: ExprValue[], fn: string): ExprValue[] {
  if (arr.length > MAX_ARRAY) {
    throw new ExprEvalError(`${fn}: result array exceeds max length (${MAX_ARRAY})`, fn);
  }
  return arr;
}

function asArray(v: ExprValue, fn: string): ExprValue[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  throw new ExprEvalError(`${fn}: expected array, got ${typeof v}`, fn);
}

type Predicate = (item: ExprValue, idx: number) => boolean;
type Mapper = (item: ExprValue, idx: number) => ExprValue;

/** These functions need a callback — the evaluator injects the lambda. */
export const aggregateFunctions: Record<string, (args: ExprValue[], predFn?: Predicate, mapFn?: Mapper) => ExprValue> = {
  SUMIF(args, predFn) {
    const arr = asArray(args[0], 'SUMIF');
    if (!predFn) return null;
    return arr.filter((item, i) => predFn(item, i))
              .reduce((s: number, v) => s + (typeof v === 'number' ? v : Number(v)), 0);
  },
  COUNTIF(args, predFn) {
    const arr = asArray(args[0], 'COUNTIF');
    if (!predFn) return 0;
    return arr.filter((item, i) => predFn(item, i)).length;
  },
  AVGIF(args, predFn) {
    const arr = asArray(args[0], 'AVGIF');
    if (!predFn) return null;
    const filtered = arr.filter((item, i) => predFn(item, i));
    if (filtered.length === 0) return null;
    const sum = filtered.reduce((s: number, v) => s + (typeof v === 'number' ? v : Number(v)), 0);
    return sum / filtered.length;
  },
  COUNT(args) {
    const arr = asArray(args[0], 'COUNT');
    return arr.filter(v => v !== null && v !== undefined).length;
  },
  COUNT_DISTINCT(args) {
    const arr = asArray(args[0], 'COUNT_DISTINCT');
    const seen = new Set(arr.filter(v => v !== null).map(v => JSON.stringify(v)));
    return seen.size;
  },
  FILTER(args, predFn) {
    const arr = asArray(args[0], 'FILTER');
    if (!predFn) return arr;
    return checkArrayLen(arr.filter((item, i) => predFn(item, i)), 'FILTER');
  },
  MAP(args, _pred, mapFn) {
    const arr = asArray(args[0], 'MAP');
    if (!mapFn) return arr;
    return checkArrayLen(arr.map((item, i) => mapFn(item, i)), 'MAP');
  },
  FIND(args, predFn) {
    const arr = asArray(args[0], 'FIND');
    if (!predFn) return null;
    return arr.find((item, i) => predFn(item, i)) ?? null;
  },
  EVERY(args, predFn) {
    const arr = asArray(args[0], 'EVERY');
    if (!predFn) return true;
    return arr.every((item, i) => predFn(item, i));
  },
  SOME(args, predFn) {
    const arr = asArray(args[0], 'SOME');
    if (!predFn) return false;
    return arr.some((item, i) => predFn(item, i));
  },
  FLAT(args) {
    const arr = asArray(args[0], 'FLAT');
    const depth = typeof args[1] === 'number' ? args[1] : 1;
    // Manual flatten to avoid type issues
    const flatDeep = (a: ExprValue[], d: number): ExprValue[] => {
      if (d === 0) return a;
      const out: ExprValue[] = [];
      for (const item of a) {
        if (Array.isArray(item)) out.push(...flatDeep(item, d - 1));
        else out.push(item);
      }
      return out;
    };
    return checkArrayLen(flatDeep(arr, depth), 'FLAT');
  },
  UNIQUE(args) {
    const arr = asArray(args[0], 'UNIQUE');
    const seen = new Set<string>();
    const result: ExprValue[] = [];
    for (const item of arr) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) { seen.add(key); result.push(item); }
    }
    return result;
  },
  SORT_BY(args, _pred, mapFn) {
    const arr = [...asArray(args[0], 'SORT_BY')];
    // If mapFn provided use it, else sort by args[1] field name string
    if (mapFn) {
      return arr.sort((a, b) => {
        const ka = mapFn(a, 0);
        const kb = mapFn(b, 0);
        if (ka === kb) return 0;
        if (ka === null) return 1;
        if (kb === null) return -1;
        return ka < kb ? -1 : 1;
      });
    }
    // args[1] is field name string for objects
    const field = typeof args[1] === 'string' ? args[1] : null;
    const dir = typeof args[2] === 'string' && args[2].toUpperCase() === 'DESC' ? -1 : 1;
    return arr.sort((a, b) => {
      const ka = field && a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, ExprValue>)[field] : a;
      const kb = field && b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, ExprValue>)[field] : b;
      if (ka === kb) return 0;
      if (ka === null || ka === undefined) return dir;
      if (kb === null || kb === undefined) return -dir;
      return (ka < kb ? -1 : 1) * dir;
    });
  },
};
