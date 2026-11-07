/**
 * Lock rule evaluator — determines whether a record is locked for editing.
 * Exception roles bypass the lock entirely.
 */

import type { ExprContext } from "./index";
import { evaluateAST } from "./evaluator";
import { parseExpression } from "./parser";

export function isRecordLocked(
  record: Record<string, unknown>,
  lockExpr: string,
  userRoles: string[],
  lockExceptionRoles?: string[],
  ctx?: Partial<ExprContext>,
): boolean {
  if (lockExceptionRoles && lockExceptionRoles.length > 0) {
    if (userRoles.some(role => lockExceptionRoles.includes(role))) return false;
  }

  const evalCtx: ExprContext = {
    record: record as Record<string, import("./index").ExprValue>,
    user: { id: "", email: "", roles: userRoles, locations: [], ...(ctx?.user ?? {}) },
    ...ctx,
  };

  try {
    const ast = parseExpression(lockExpr);
    const result = evaluateAST(ast, evalCtx);
    return result !== null && result !== false && result !== 0 && result !== "";
  } catch {
    return false;
  }
}
