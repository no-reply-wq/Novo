/**
 * Lock rule evaluator.
 *
 * Evaluates whether a record is locked for editing based on:
 * - A lock expression (e.g., `status in ('Approved','Received')`)
 * - Optional role exceptions (e.g., admin can still edit)
 */

import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';

export interface LockResult {
  locked: boolean;
  reason?: string;
}

/**
 * Evaluate a lock rule against a record and user role.
 *
 * @param record    - current record values
 * @param lockExpr  - expression that evaluates to true when locked
 * @param userRole  - current user's role id
 * @param exceptionRoles - roles that can bypass the lock (optional)
 * @returns         - lock result with optional reason
 */
export function evaluateLockRule(
  record: Record<string, unknown>,
  lockExpr: string,
  userRole: string,
  exceptionRoles: string[] = [],
): LockResult {
  // Role exception — bypass lock entirely
  if (exceptionRoles.includes(userRole)) {
    return { locked: false };
  }

  let isLocked: boolean;
  try {
    const ast = parseExpression(lockExpr);
    const ctx: ExprContext = { record: record as Record<string, ExprValue> };
    const result = evaluateAST(ast, ctx);
    isLocked = result === true;
  } catch {
    // Evaluation error — default to unlocked (safe fallback)
    isLocked = false;
  }

  if (!isLocked) {
    return { locked: false };
  }

  return {
    locked: true,
    reason: buildLockReason(lockExpr, record),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a human-readable reason string from the lock expression.
 * Tries to extract the status value from common patterns like
 * `status in ('Approved','Received')` or `status = 'Closed'`.
 */
function buildLockReason(lockExpr: string, record: Record<string, unknown>): string {
  // Try to find the status field value from the record for a friendly message
  const inMatch = /^(\w+)\s+in\s+\(([^)]+)\)/i.exec(lockExpr.trim());
  if (inMatch) {
    const fieldName = inMatch[1];
    const currentValue = record[fieldName];
    if (currentValue) {
      return `Record is locked because ${fieldName} is '${currentValue}'`;
    }
    return `Record is locked (${fieldName} matches a locked status)`;
  }

  const eqMatch = /^(\w+)\s*=\s*'([^']*)'/i.exec(lockExpr.trim());
  if (eqMatch) {
    return `Record is locked because ${eqMatch[1]} is '${eqMatch[2]}'`;
  }

  return 'Record is locked and cannot be edited';
}
