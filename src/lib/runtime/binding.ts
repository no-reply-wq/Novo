/**
 * Data binding engine — resolves {{ expr }} placeholders in component props.
 */

import type { ExpressionOrValue, BindingContext, Row } from '@/types/runtime';
import { isExpressionBinding } from '@/types/runtime';

export { isExpressionBinding };

// ─── Public API ───────────────────────────────────────────────────────────────

export function resolveBindings(
  props: Record<string, ExpressionOrValue>,
  context: BindingContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveValue(value, context);
  }
  return result;
}

export function resolveValue(value: ExpressionOrValue, context: BindingContext): unknown {
  if (value === null || value === undefined) return value;

  if (isExpressionBinding(value)) {
    return evaluateExpression(value.__expr, context);
  }

  if (typeof value === 'string') {
    // Replace inline {{ expr }} patterns in a string
    return resolveStringTemplate(value, context);
  }

  // number, boolean — pass through unchanged
  return value;
}

// ─── Template strings ─────────────────────────────────────────────────────────

const TEMPLATE_PATTERN = /\{\{\s*(.*?)\s*\}\}/g;

function resolveStringTemplate(template: string, context: BindingContext): unknown {
  // If the entire string is a single binding, return the raw value (not stringified)
  const singleMatch = /^\{\{\s*(.*?)\s*\}\}$/.exec(template);
  if (singleMatch) {
    return evaluateExpression(singleMatch[1], context);
  }

  // Otherwise interpolate all bindings into the string
  return template.replace(TEMPLATE_PATTERN, (_, expr: string) => {
    const val = evaluateExpression(expr.trim(), context);
    return val == null ? '' : String(val);
  });
}

// ─── Expression evaluator ─────────────────────────────────────────────────────

/**
 * Evaluates a dotted-path expression against the binding context.
 *
 * Supported paths:
 *   query1.data              → QueryResult.data (Row[])
 *   query1.data[0].field     → first row's field
 *   query1.selectedRow.field → selected row's field
 *   query1.total             → QueryResult.total
 *   pageState.key            → pageState[key]
 *   user.name / user.role / user.id / user.locations
 *   urlParams.paramName
 */
export function evaluateExpression(expr: string, context: BindingContext): unknown {
  const parts = tokenisePath(expr);
  if (parts.length === 0) return null;

  const [root, ...rest] = parts;

  if (root === 'user') {
    return traversePath(context.user, rest);
  }

  if (root === 'urlParams') {
    return traversePath(context.urlParams, rest);
  }

  if (root === 'pageState') {
    return traversePath(context.pageState, rest);
  }

  // query reference
  const queryResult = context.queries[root];
  if (!queryResult) return null;

  if (rest.length === 0) return queryResult.data;

  const [queryProp, ...deepRest] = rest;

  if (queryProp === 'data') {
    if (deepRest.length === 0) return queryResult.data;
    // support data[n].field or data.0.field
    const [indexOrField, ...fieldRest] = deepRest;
    const idx = Number(indexOrField);
    if (!Number.isNaN(idx)) {
      const row = queryResult.data[idx] ?? null;
      return fieldRest.length > 0 ? traversePath(row, fieldRest) : row;
    }
    // data.fieldName — map over all rows
    return queryResult.data.map((row) => traversePath(row, [indexOrField, ...fieldRest]));
  }

  if (queryProp === 'selectedRow') {
    return deepRest.length > 0
      ? traversePath(queryResult.selectedRow, deepRest)
      : queryResult.selectedRow;
  }

  if (queryProp === 'total') return queryResult.total;
  if (queryProp === 'page') return queryResult.page;

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tokenises a dotted/bracket path expression into string segments.
 * "query1.data[0].name" → ["query1", "data", "0", "name"]
 */
function tokenisePath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
}

function traversePath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null) return null;
    if (typeof current === 'object') {
      const idx = Number(key);
      if (!Number.isNaN(idx) && Array.isArray(current)) {
        current = (current as unknown[])[idx] ?? null;
      } else {
        current = (current as Record<string, unknown>)[key] ?? null;
      }
    } else {
      return null;
    }
  }
  return current;
}

// ─── Convenience: build a BindingContext from raw query results ───────────────

export function buildBindingContext(
  queries: Record<string, { data: Row[]; total: number; page: number }>,
  pageState: Record<string, unknown>,
  user: BindingContext['user'],
  urlParams: Record<string, string>,
): BindingContext {
  return {
    queries: Object.fromEntries(
      Object.entries(queries).map(([k, v]) => [
        k,
        { ...v, selectedRow: v.data[0] ?? null },
      ]),
    ),
    pageState,
    user,
    urlParams,
  };
}
