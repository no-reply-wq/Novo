/**
 * LOOKUP(relationId, filterExpr, fieldId) — searches context.relations
 *
 * Returns array of matching field values.
 */

import { ExprEvalError } from '../index';
import type { ExprValue, ExprContext } from '../index';

export function makeLookupFunction(
  ctx: ExprContext,
  evaluate: (source: string, rowCtx: ExprContext) => ExprValue,
): (args: ExprValue[]) => ExprValue {
  return function LOOKUP(args): ExprValue {
    const relationId = typeof args[0] === 'string' ? args[0] : String(args[0]);
    const filterExprStr = typeof args[1] === 'string' ? args[1] : null;
    const fieldId = typeof args[2] === 'string' ? args[2] : null;

    const rows = ctx.relations?.[relationId];
    if (!rows) return [];

    let filtered = rows;
    if (filterExprStr) {
      filtered = rows.filter(row => {
        try {
          const result = evaluate(filterExprStr, { ...ctx, record: row });
          return result !== null && result !== false && result !== 0 && result !== '';
        } catch {
          return false;
        }
      });
    }

    if (fieldId) {
      return filtered.map(row => row[fieldId] ?? null);
    }

    return filtered as unknown as ExprValue[];
  };
}

export function makeSequenceFunction(
  ctx: ExprContext,
): (args: ExprValue[]) => ExprValue {
  // SEQUENCE returns current counter value from vars or tables
  return function SEQUENCE(args): ExprValue {
    const seqId = typeof args[0] === 'string' ? args[0] : String(args[0]);
    // In production this would call the DB; in expressions context we return from vars
    const val = ctx.vars?.[`__seq_${seqId}`];
    if (typeof val === 'number') return val;
    throw new ExprEvalError(`SEQUENCE: sequence '${seqId}' not found in context`, seqId);
  };
}
