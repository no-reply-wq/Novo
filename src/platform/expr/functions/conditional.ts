/**
 * Conditional functions: IF, IFS, SWITCH, COALESCE, NULLIF
 *
 * Note: args here are already-evaluated values (eager evaluation is fine for
 * most cases; IF short-circuit is handled specially in the evaluator via
 * lazy evaluation of the function node's args).
 */

import type { ExprValue } from '../index';

function isTruthy(v: ExprValue): boolean {
  if (v === null || v === false || v === 0 || v === '') return false;
  return true;
}

export const conditionalFunctions: Record<string, (args: ExprValue[]) => ExprValue> = {
  IF(args) {
    return isTruthy(args[0]) ? (args[1] ?? null) : (args[2] ?? null);
  },
  IFS(args) {
    // IFS(cond1, val1, cond2, val2, ...) — returns first truthy val
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (isTruthy(args[i])) return args[i + 1];
    }
    return null;
  },
  SWITCH(args) {
    // SWITCH(expr, case1, val1, case2, val2, ..., [default])
    const expr = args[0];
    const pairs = args.slice(1);
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      if (pairs[i] === expr) return pairs[i + 1];
    }
    // If odd number of remaining args, last is default
    if (pairs.length % 2 === 1) return pairs[pairs.length - 1];
    return null;
  },
  COALESCE(args) {
    for (const a of args) {
      if (a !== null && a !== undefined) return a;
    }
    return null;
  },
  NULLIF(args) {
    if (args[0] === args[1]) return null;
    return args[0] ?? null;
  },
};
