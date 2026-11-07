/**
 * Validation rule evaluator — runs boolean expressions against a record
 * before INSERT/UPDATE and collects violations.
 */

import type { ExprType, ExprContext } from "./index";
import { evaluateAST } from "./evaluator";
import { parseExpression } from "./parser";

export interface ValidationRule {
  field?: string;
  expr: string;
  message: string;
}

export interface ValidationError {
  field?: string;
  message: string;
  rule: string;
}

export function validateRecord(
  record: Record<string, unknown>,
  rules: ValidationRule[],
  _fieldTypes: Record<string, ExprType>,
  ctx?: Partial<ExprContext>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const evalCtx: ExprContext = {
    record: record as Record<string, import("./index").ExprValue>,
    ...ctx,
  };

  for (const rule of rules) {
    let passed = false;
    try {
      const ast = parseExpression(rule.expr);
      const result = evaluateAST(ast, evalCtx);
      passed = result !== null && result !== false && result !== 0 && result !== "";
    } catch {
      passed = false;
    }
    if (!passed) {
      errors.push({ field: rule.field, message: rule.message, rule: rule.expr });
    }
  }

  return errors;
}
