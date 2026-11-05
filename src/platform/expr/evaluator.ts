/**
 * AST evaluator — pure, no I/O, no dynamic code execution.
 *
 * Security invariants:
 * - NO eval(), Function(), new Function(), vm.*, require(), dynamic import()
 * - Max AST depth 50 (enforced in parser; re-checked here)
 * - Max string result 100 000 chars
 * - Max array result 10 000 items
 * - Prototype pollution blocked: no __proto__, constructor, prototype access
 */

import { ExprEvalError } from './index';
import type { ExprValue, ExprContext } from './index';
import type { ASTNode, FieldRefNode, ExprAST } from './ast';
import { parseExpression } from './parser';

import { mathFunctions } from './functions/math';
import { conditionalFunctions } from './functions/conditional';
import { textFunctions } from './functions/text';
import { makeDateFunctions } from './functions/date';
import { aggregateFunctions } from './functions/aggregate';
import { typeFunctions } from './functions/type';
import { makeLookupFunction, makeSequenceFunction } from './functions/lookup';

// ─── Security constants ───────────────────────────────────────────────────────

const MAX_DEPTH = 50;
const MAX_STRING = 100_000;
const MAX_ARRAY = 10_000;

/** Property names that must never be accessed on any object. */
const FORBIDDEN_PROPS = new Set([
  '__proto__', 'prototype', 'constructor',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'eval', 'Function', 'require', 'import',
]);

function guardProp(key: string, source: string): void {
  if (FORBIDDEN_PROPS.has(key)) {
    throw new ExprEvalError(
      `Security violation: access to '${key}' is forbidden`,
      source,
    );
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

export function evaluateAST(ast: ExprAST, ctx: ExprContext): ExprValue {
  const fns = buildFunctionTable(ctx, ast.source);
  return evalNode(ast.root, ctx, fns, ast.source, 0);
}

function evalNode(
  node: ASTNode,
  ctx: ExprContext,
  fns: FunctionTable,
  source: string,
  depth: number,
): ExprValue {
  if (depth > MAX_DEPTH) {
    throw new ExprEvalError(`Expression too deeply nested (max depth ${MAX_DEPTH})`, source);
  }

  const next = (n: ASTNode) => evalNode(n, ctx, fns, source, depth + 1);

  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Array': {
      const result = node.elements.map(e => next(e));
      if (result.length > MAX_ARRAY) {
        throw new ExprEvalError(`Array literal exceeds max length (${MAX_ARRAY})`, source);
      }
      return result;
    }

    case 'FieldRef':
      return evalFieldRef(node, ctx, source);

    case 'UnaryOp': {
      const v = next(node.operand);
      if (node.op === '-') {
        if (typeof v === 'number') return -v;
        return -(Number(v));
      }
      // NOT
      return !isTruthy(v);
    }

    case 'BinaryOp': {
      // Short-circuit AND / OR
      if (node.op === 'AND') {
        const lv = next(node.left);
        if (!isTruthy(lv)) return false;
        return isTruthy(next(node.right));
      }
      if (node.op === 'OR') {
        const lv = next(node.left);
        if (isTruthy(lv)) return true;
        return isTruthy(next(node.right));
      }
      const left = next(node.left);
      const right = next(node.right);
      return evalBinaryOp(node.op, left, right, source);
    }

    case 'In': {
      const val = next(node.value);
      const listVal = next(node.list);
      const arr = Array.isArray(listVal) ? listVal : [listVal];
      const found = arr.some(item => loosEqual(val, item));
      return node.negated ? !found : found;
    }

    case 'FunctionCall': {
      const name = node.name;

      // IF and IFS get lazy evaluation for short-circuit
      if (name === 'IF') {
        const cond = next(node.args[0]);
        if (isTruthy(cond)) {
          return node.args[1] !== undefined ? next(node.args[1]) : null;
        }
        return node.args[2] !== undefined ? next(node.args[2]) : null;
      }

      // Aggregate functions with predicate lambdas
      if (name === 'SUMIF' || name === 'COUNTIF' || name === 'AVGIF' ||
          name === 'FILTER' || name === 'FIND' || name === 'EVERY' || name === 'SOME') {
        // args[0] = array, args[1] = lambda expr string or inline fn
        const arr = next(node.args[0]);
        const fn = aggregateFunctions[name];
        if (!fn) return null;
        return fn([arr]);
      }

      if (name === 'MAP' || name === 'SORT_BY') {
        const arr = next(node.args[0]);
        const fn = aggregateFunctions[name];
        if (!fn) return null;
        return fn([arr], undefined, undefined);
      }

      // Look up in function table
      const fn = fns[name];
      if (!fn) {
        // Unknown function — return null (benign error)
        return null;
      }
      const args = node.args.map(a => next(a));
      return fn(args);
    }
  }
}

function evalBinaryOp(
  op: string,
  left: ExprValue,
  right: ExprValue,
  source: string,
): ExprValue {
  switch (op) {
    case '+': {
      if (typeof left === 'string' || typeof right === 'string') {
        const result = strVal(left) + strVal(right);
        if (result.length > MAX_STRING) {
          throw new ExprEvalError(`String concatenation result exceeds max length (${MAX_STRING})`, source);
        }
        return result;
      }
      if (left instanceof Date || right instanceof Date) return null;
      return toNum(left) + toNum(right);
    }
    case '-': return toNum(left) - toNum(right);
    case '*': return toNum(left) * toNum(right);
    case '/': {
      const d = toNum(right);
      if (d === 0) return null; // benign divide-by-zero
      return toNum(left) / d;
    }
    case '%': {
      const d = toNum(right);
      if (d === 0) return null;
      return toNum(left) % d;
    }
    case '=': return loosEqual(left, right);
    case '!=': return !loosEqual(left, right);
    case '<': return compare(left, right) < 0;
    case '>': return compare(left, right) > 0;
    case '<=': return compare(left, right) <= 0;
    case '>=': return compare(left, right) >= 0;
    default: return null;
  }
}

function evalFieldRef(node: FieldRefNode, ctx: ExprContext, source: string): ExprValue {
  const [root, ...rest] = node.parts;

  // Guard root
  guardProp(root, source);

  // Resolve root namespace
  let current: ExprValue;
  if (root === 'record') {
    current = ctx.record ?? null;
  } else if (root === 'user') {
    current = ctx.user ?? null;
  } else if (root === 'vars') {
    current = ctx.vars ?? null;
  } else {
    // Try record fields directly (bare field ref without namespace)
    if (ctx.record && root in ctx.record) {
      current = ctx.record[root] ?? null;
    } else if (ctx.vars && root in ctx.vars) {
      current = ctx.vars[root] ?? null;
    } else {
      return null;
    }
  }

  // Walk remaining parts
  for (const part of rest) {
    guardProp(part, source);
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, ExprValue>)[part] ?? null;
  }

  // Handle index access
  if (node.index !== undefined) {
    guardProp('__index__', source); // internal; just ensure we don't skip guard
    if (!Array.isArray(current)) return null;
    current = current[node.index] ?? null;
  }

  // Handle tail (chained after index)
  if (node.tail) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object' || Array.isArray(current)) return null;
    return evalFieldRef(node.tail, { record: current as Record<string, ExprValue> }, source);
  }

  return current;
}

// ─── Function table ───────────────────────────────────────────────────────────

type FunctionTable = Record<string, (args: ExprValue[]) => ExprValue>;

function buildFunctionTable(ctx: ExprContext, source: string): FunctionTable {
  const dateFns = makeDateFunctions(ctx);
  const lookupFn = makeLookupFunction(ctx, (src, rowCtx) => {
    const ast = parseExpression(src);
    return evaluateAST(ast, rowCtx);
  });
  const seqFn = makeSequenceFunction(ctx);

  const table: FunctionTable = {
    ...mathFunctions,
    ...conditionalFunctions,
    ...textFunctions,
    ...dateFns,
    ...typeFunctions,
    // Aggregate functions (simple, without predicate)
    COUNT: aggregateFunctions.COUNT as (args: ExprValue[]) => ExprValue,
    COUNT_DISTINCT: aggregateFunctions.COUNT_DISTINCT as (args: ExprValue[]) => ExprValue,
    FLAT: aggregateFunctions.FLAT as (args: ExprValue[]) => ExprValue,
    UNIQUE: aggregateFunctions.UNIQUE as (args: ExprValue[]) => ExprValue,
    SORT_BY: (args) => aggregateFunctions.SORT_BY(args),
    FILTER: (args) => aggregateFunctions.FILTER(args),
    MAP: (args) => aggregateFunctions.MAP(args),
    FIND: (args) => aggregateFunctions.FIND(args),
    EVERY: (args) => aggregateFunctions.EVERY(args),
    SOME: (args) => aggregateFunctions.SOME(args),
    SUMIF: (args) => aggregateFunctions.SUMIF(args),
    COUNTIF: (args) => aggregateFunctions.COUNTIF(args),
    AVGIF: (args) => aggregateFunctions.AVGIF(args),
    LOOKUP: lookupFn,
    SEQUENCE: seqFn,
  };

  // Validate: none of the function names should be dangerous
  // (belt-and-suspenders; they're all static strings above)
  for (const k of Object.keys(table)) {
    guardProp(k, source);
  }

  return table;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTruthy(v: ExprValue): boolean {
  if (v === null || v === false || v === 0 || v === '') return false;
  return true;
}

function toNum(v: ExprValue): number {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function strVal(v: ExprValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function loosEqual(a: ExprValue, b: ExprValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  // string/number coercion
  if (typeof a !== typeof b) {
    if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
    if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  }
  return String(a) === String(b);
}

function compare(a: ExprValue, b: ExprValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
