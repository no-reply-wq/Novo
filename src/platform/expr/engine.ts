/**
 * ExprEngine concrete implementation.
 *
 * Export default — registered as EXPR_ENGINE in the DI container.
 */

import type {
  ExprEngine,
  CompiledExpr,
  ExprContext,
  ExprValue,
  ExprType,
  TypeCheckResult,
  SqlFragment,
} from './index';
import { ExprParseError, ExprEvalError } from './index';
import { parseExpression } from './parser';
import type { ExprAST } from './ast';
import { evaluateAST } from './evaluator';
import { typeCheck as typeCheckAST } from './type-checker';
import { toSql as toSqlAST } from './sql-transpiler';

/** Internal compiled expression — carries the AST alongside the public fields. */
interface InternalCompiledExpr extends CompiledExpr {
  readonly _ast: ExprAST;
}

class ExprEngineImpl implements ExprEngine {
  parse(source: string): CompiledExpr {
    const ast = parseExpression(source);
    // Quick type-inference for resultType (best-effort)
    const tcResult = typeCheckAST(ast, {});
    const compiled: InternalCompiledExpr = {
      source,
      resultType: tcResult.inferredType,
      _ast: ast,
    };
    return compiled;
  }

  typeCheck(expr: CompiledExpr, fieldTypes: Record<string, ExprType>): TypeCheckResult {
    const internal = expr as InternalCompiledExpr;
    if (!internal._ast) {
      return { ok: false, inferredType: 'any', errors: [{ message: 'Invalid compiled expression' }], warnings: [] };
    }
    return typeCheckAST(internal._ast, fieldTypes);
  }

  evaluate(expr: CompiledExpr, ctx: ExprContext): ExprValue {
    const internal = expr as InternalCompiledExpr;
    if (!internal._ast) {
      throw new ExprEvalError('Invalid compiled expression', expr.source, ctx);
    }
    try {
      return evaluateAST(internal._ast, ctx);
    } catch (e) {
      if (e instanceof ExprEvalError) throw e;
      // Benign runtime error — return null
      return null;
    }
  }

  evaluateSource(source: string, ctx: ExprContext): ExprValue {
    const expr = this.parse(source); // throws ExprParseError on syntax error
    return this.evaluate(expr, ctx);
  }

  toSql(expr: CompiledExpr, fieldTypes: Record<string, ExprType>): SqlFragment | null {
    const internal = expr as InternalCompiledExpr;
    if (!internal._ast) return null;
    return toSqlAST(internal._ast, fieldTypes);
  }
}

const engine: ExprEngine = new ExprEngineImpl();
export default engine;
