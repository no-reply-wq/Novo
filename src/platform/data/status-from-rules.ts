/**
 * Status-from-rules engine.
 *
 * Derives a status string from an ordered list of ranked rules.
 * First matching rule wins. Falls back to `defaultStatus` when no rule matches.
 *
 * Rules are re-evaluated:
 *   - On save of the host record
 *   - On save of any child record (the parent must be recomputed)
 *
 * Each rule condition is an expression evaluated by the expr engine.
 * The evaluation context includes the current record and any related rows
 * passed in via `relations`.
 */

import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';
import type { StatusFromRulesOptions } from '@/platform/contracts';
import { NotConfiguredError } from './errors';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StatusEvalOptions {
  /** Related rows, keyed by relation id or apiKey. */
  relations?: Record<string, Record<string, ExprValue>[]>;
  /** Current user context. */
  user?: ExprContext['user'];
  /** Page/query state variables. */
  vars?: Record<string, ExprValue>;
  /** Named lookup tables (pre-fetched). */
  tables?: Record<string, Record<string, ExprValue>[]>;
  /** Deterministic now (for tests). */
  now?: Date;
}

export interface StatusEvalResult {
  /** The resolved status string. */
  status: string;
  /** The rank of the rule that matched, or null for the default. */
  matchedRuleRank: number | null;
  /** The label of the rule that matched, or null for the default. */
  matchedRuleLabel: string | null;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluate status-from-rules for a single record.
 *
 * @param opts    - StatusFromRulesOptions (rules + defaultStatus)
 * @param row     - the current record values
 * @param evalOpts - optional context (relations, user, now)
 * @returns       - evaluation result with the matched status
 */
export function evaluateStatusFromRules(
  opts: StatusFromRulesOptions,
  row: Record<string, unknown>,
  evalOpts: StatusEvalOptions = {},
): StatusEvalResult {
  if (!opts.rules) {
    throw new NotConfiguredError('status_from_rules.rules');
  }

  const ctx: ExprContext = {
    record: row as Record<string, ExprValue>,
    relations: evalOpts.relations,
    user: evalOpts.user,
    vars: evalOpts.vars,
    tables: evalOpts.tables,
    now: evalOpts.now ?? new Date(),
  };

  // Sort rules ascending by rank (lower rank = higher priority)
  const sorted = [...opts.rules].sort((a, b) => a.rank - b.rank);

  for (const rule of sorted) {
    if (!rule.condition?.trim()) continue;

    let matched: boolean;
    try {
      const ast = parseExpression(rule.condition);
      const result = evaluateAST(ast, ctx);
      matched = result === true;
    } catch {
      // Rule evaluation failure is not fatal — skip to next rule
      continue;
    }

    if (matched) {
      return {
        status: rule.label,
        matchedRuleRank: rule.rank,
        matchedRuleLabel: rule.label,
      };
    }
  }

  return {
    status: opts.defaultStatus,
    matchedRuleRank: null,
    matchedRuleLabel: null,
  };
}

/**
 * Convenience wrapper — returns just the status string.
 *
 * Returns `defaultStatus` on any configuration error rather than throwing,
 * so a misconfigured field never breaks the record read.
 */
export function deriveStatus(
  opts: StatusFromRulesOptions | undefined,
  row: Record<string, unknown>,
  evalOpts: StatusEvalOptions = {},
): string {
  if (!opts) return '';
  try {
    return evaluateStatusFromRules(opts, row, evalOpts).status;
  } catch {
    return opts.defaultStatus ?? '';
  }
}

// ─── Trigger helper ───────────────────────────────────────────────────────────

/**
 * Determine which parent records need their status recomputed after a child
 * record is saved.
 *
 * Returns the set of parent IDs (from `fkField` on the child row) that
 * own status_from_rules fields whose conditions may reference child rows.
 *
 * In practice the caller re-evaluates ALL status_from_rules fields on the
 * parent after any child mutation.
 *
 * @param childRow   - the saved child row
 * @param fkField    - the apiKey of the FK column pointing to the parent
 * @returns          - set of parent IDs to recompute
 */
export function getAffectedParentIds(
  childRow: Record<string, unknown>,
  fkField: string,
): Set<string> {
  const parentId = childRow[fkField];
  if (typeof parentId === 'string' && parentId) {
    return new Set([parentId]);
  }
  return new Set();
}
