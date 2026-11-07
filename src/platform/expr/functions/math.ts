/**
 * Math functions: SUM, AVG, MIN, MAX, ROUND, CEIL, FLOOR, ABS,
 *                MOD, POWER, SQRT
 */

import { ExprEvalError } from "../index";
import type { ExprValue } from "../index";

function toNum(v: ExprValue, fn: string): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  if (isNaN(n)) throw new ExprEvalError(`${fn}: expected number, got ${typeof v}`, String(v));
  return n;
}

function flatten(args: ExprValue[]): number[] {
  const result: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const item of a) {
        if (typeof item === "number") result.push(item);
        else if (item !== null) result.push(Number(item));
      }
    } else if (typeof a === "number") {
      result.push(a);
    } else if (a !== null) {
      result.push(Number(a));
    }
  }
  return result;
}

export const mathFunctions: Record<string, (args: ExprValue[]) => ExprValue> = {
  SUM(args) {
    return flatten(args).reduce((a, b) => a + b, 0);
  },
  AVG(args) {
    const nums = flatten(args);
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  MIN(args) {
    const nums = flatten(args);
    if (nums.length === 0) return null;
    return Math.min(...nums);
  },
  MAX(args) {
    const nums = flatten(args);
    if (nums.length === 0) return null;
    return Math.max(...nums);
  },
  ROUND(args) {
    const n = toNum(args[0], "ROUND");
    const decimals = args[1] !== undefined ? toNum(args[1], "ROUND") : 0;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  },
  CEIL(args) {
    return Math.ceil(toNum(args[0], "CEIL"));
  },
  FLOOR(args) {
    return Math.floor(toNum(args[0], "FLOOR"));
  },
  ABS(args) {
    return Math.abs(toNum(args[0], "ABS"));
  },
  MOD(args) {
    const a = toNum(args[0], "MOD");
    const b = toNum(args[1], "MOD");
    if (b === 0) return null;
    return a % b;
  },
  POWER(args) {
    return Math.pow(toNum(args[0], "POWER"), toNum(args[1], "POWER"));
  },
  SQRT(args) {
    const n = toNum(args[0], "SQRT");
    if (n < 0) return null;
    return Math.sqrt(n);
  },
};
