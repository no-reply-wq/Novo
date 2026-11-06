/**
 * AST evaluator for the Novo expression engine.
 *
 * Security invariants:
 * - NO eval(), Function(), new Function(), vm.*, require(), dynamic import()
 * - Max expression length: 2000 chars
 * - Max AST depth: 20 nodes
 * - Max function call nesting: 10
 * - Max array size: 10,000 items
 * - Execution budget: counter-based, throws on excess
 * - Prototype pollution blocked: __proto__, constructor, prototype are forbidden
 */

import { parse, ASTNode, ParseError } from './parser';
import { BUILTIN_FUNCTIONS, ExprVal } from './functions';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EvalContext {
  record: Record<string, unknown>;
  lines?: Record<string, unknown>[];
  user: { id: string; name: string; role: string; locations: string[] };
  pageState?: Record<string, unknown>;
  urlParams?: Record<string, string>;
  now: Date;
}

export type EvalResult = string | number | boolean | null | unknown[];

// ─── Security constants ───────────────────────────────────────────────────────

const MAX_EXPR_LENGTH  = 2000;
const MAX_DEPTH        = 20;
const MAX_CALL_NESTING = 10;
const MAX_ARRAY_ITEMS  = 10_000;
const MAX_BUDGET       = 50_000; // operation count ceiling

const FORBIDDEN_PROPS = new Set([
  '__proto__', 'prototype', 'constructor',
  '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
]);

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export class SecurityError extends ExpressionError {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ─── Evaluation state ─────────────────────────────────────────────────────────

interface EvalState {
  budget: number;
  callDepth: number;
}

function guardProp(key: string): void {
  if (FORBIDDEN_PROPS.has(key)) {
    throw new SecurityError(`Access to '${key}' is forbidden`);
  }
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

function evalNode(node: ASTNode, ctx: EvalContext, state: EvalState, depth: number): ExprVal {
  if (--state.budget <= 0) {
    throw new ExpressionError('Expression exceeded execution budget (possible infinite loop)');
  }
  if (depth > MAX_DEPTH) {
    throw new ExpressionError(`Expression AST too deep (max ${MAX_DEPTH})`);
  }

  const next = (n: ASTNode) => evalNode(n, ctx, state, depth + 1);

  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'ArrayExpression': {
      const items = node.elements.map(e => next(e));
      if (items.length > MAX_ARRAY_ITEMS) {
        throw new ExpressionError(`Array literal too large (max ${MAX_ARRAY_ITEMS})`);
      }
      return items;
    }

    case 'Identifier': {
      const name = node.name;
      guardProp(name);
      // Try record fields first (bare ref)
      if (name in ctx.record) return (ctx.record[name] ?? null) as ExprVal;
      // Then pageState
      if (ctx.pageState && name in ctx.pageState) return (ctx.pageState[name] ?? null) as ExprVal;
      return null;
    }

    case 'MemberExpression': {
      guardProp(node.property);
      const obj = next(node.object);
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object' || Array.isArray(obj)) return null;
      return ((obj as Record<string, unknown>)[node.property] ?? null) as ExprVal;
    }

    case 'UnaryExpression': {
      const v = next(node.operand);
      if (node.op === '-') {
        if (typeof v === 'number') return -v;
        return -(Number(v));
      }
      // !
      return !isTruthy(v);
    }

    case 'BinaryExpression': {
      const { op } = node;
      // No short-circuit needed for binary
      const left  = next(node.left);
      const right = next(node.right);
      return evalBinary(op, left, right);
    }

    case 'LogicalExpression': {
      const left = next(node.left);
      if (node.op === '&&') {
        if (!isTruthy(left)) return false;
        return isTruthy(next(node.right));
      }
      // ||
      if (isTruthy(left)) return true;
      return isTruthy(next(node.right));
    }

    case 'ConditionalExpression': {
      const test = next(node.test);
      return isTruthy(test) ? next(node.consequent) : next(node.alternate);
    }

    case 'CallExpression': {
      const fnName = node.callee.toUpperCase();
      guardProp(fnName);

      if (++state.callDepth > MAX_CALL_NESTING) {
        throw new ExpressionError(`Function call nesting exceeds limit (${MAX_CALL_NESTING})`);
      }

      try {
        // Lazy IF: short-circuit evaluation
        if (fnName === 'IF') {
          const cond = next(node.args[0]);
          const result = isTruthy(cond)
            ? (node.args[1] !== undefined ? next(node.args[1]) : null)
            : (node.args[2] !== undefined ? next(node.args[2]) : null);
          return result;
        }

        // IFS: short-circuit pairs
        if (fnName === 'IFS') {
          for (let i = 0; i + 1 < node.args.length; i += 2) {
            const cond = next(node.args[i]);
            if (isTruthy(cond)) return next(node.args[i + 1]);
          }
          if (node.args.length % 2 === 1) {
            return next(node.args[node.args.length - 1]);
          }
          return null;
        }

        const fn = BUILTIN_FUNCTIONS[fnName];
        if (!fn) {
          // Unknown function — benign null (not a security violation)
          return null;
        }

        const args = node.args.map(a => next(a));
        return fn(args, ctx.now) as ExprVal;
      } finally {
        state.callDepth--;
      }
    }
  }
}

// ─── Binary operations ────────────────────────────────────────────────────────

function evalBinary(
  op: string,
  left: ExprVal,
  right: ExprVal,
): ExprVal {
  switch (op) {
    case '+': {
      if (typeof left === 'string' || typeof right === 'string') {
        return toStr(left) + toStr(right);
      }
      if (left instanceof Date || right instanceof Date) return null;
      return toNum(left) + toNum(right);
    }
    case '-': return toNum(left) - toNum(right);
    case '*': return toNum(left) * toNum(right);
    case '/': {
      const d = toNum(right);
      return d === 0 ? null : toNum(left) / d;
    }
    case '%': {
      const d = toNum(right);
      return d === 0 ? null : toNum(left) % d;
    }
    case '==': return looseEq(left, right);
    case '!=': return !looseEq(left, right);
    case '<':  return compare(left, right) < 0;
    case '<=': return compare(left, right) <= 0;
    case '>':  return compare(left, right) > 0;
    case '>=': return compare(left, right) >= 0;
    default:   return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTruthy(v: ExprVal): boolean {
  return v !== null && v !== false && v !== 0 && v !== '';
}

function toNum(v: ExprVal): number {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  if (v === true) return 1;
  if (v === false) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toStr(v: ExprVal): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function looseEq(a: ExprVal, b: ExprVal): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return false;
}

function compare(a: ExprVal, b: ExprVal): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// ─── Resolve member access on the context root ────────────────────────────────

function resolveIdentifierInContext(name: string, ctx: EvalContext): ExprVal {
  guardProp(name);
  switch (name) {
    case 'record':    return ctx.record as unknown as ExprVal;
    case 'user':      return ctx.user as unknown as ExprVal;
    case 'lines':     return (ctx.lines ?? null) as unknown as ExprVal;
    case 'pageState': return (ctx.pageState ?? null) as unknown as ExprVal;
    case 'urlParams': return (ctx.urlParams ?? null) as unknown as ExprVal;
    default:
      if (name in ctx.record) return (ctx.record[name] ?? null) as ExprVal;
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────



// Inject namespace roots into the record so Identifier('record') and
// Identifier('user') resolve correctly via MemberExpression traversal.
function buildEvalContext(ctx: EvalContext): EvalContext {
  const injected: Record<string, unknown> = {
    record:    ctx.record,
    user:      ctx.user,
    lines:     ctx.lines ?? null,
    pageState: ctx.pageState ?? null,
    urlParams: ctx.urlParams ?? null,
    ...ctx.record, // bare field refs still work
  };
  return { ...ctx, record: injected };
}

/**
 * Evaluate an expression string in the given context.
 * Throws ExpressionError / SecurityError / ParseError on failure.
 */
export function evaluateExpression(expression: string, context: EvalContext): EvalResult {
  if (expression.length > MAX_EXPR_LENGTH) {
    throw new ExpressionError(
      `Expression too long (${expression.length} chars; max ${MAX_EXPR_LENGTH})`,
    );
  }
  const ast = parse(expression);
  const enrichedCtx = buildEvalContext(context);
  const state: EvalState = { budget: MAX_BUDGET, callDepth: 0 };
  return evalNode(ast, enrichedCtx, state, 0) as EvalResult;
}

export function evaluateSafeExpression(
  expression: string,
  context: EvalContext,
): { value: EvalResult; error?: string } {
  try {
    return { value: evaluateExpression(expression, context) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { value: null, error: msg };
  }
}

