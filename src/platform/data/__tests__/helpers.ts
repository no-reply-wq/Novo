/**
 * Shared test helpers.
 */

import { Pool } from 'pg';
import type { ExprEngine, ExprContext, CompiledExpr, TypeCheckResult } from '@/platform/expr';
import type { ExprValue } from '@/platform/expr';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://testuser:testpass@localhost:5432/testdb';

export function makePool(): Pool {
  return new Pool({ connectionString: TEST_DB_URL, max: 5 });
}

/** Minimal no-op ExprEngine for tests that don't need expression evaluation */
export const noopExprEngine: ExprEngine = {
  parse(source: string): CompiledExpr {
    return { source, resultType: 'any' };
  },
  typeCheck(_expr: CompiledExpr, _fieldTypes: Record<string, import('@/platform/expr').ExprType>): TypeCheckResult {
    return { ok: true, inferredType: 'any', errors: [], warnings: [] };
  },
  evaluate(_expr: CompiledExpr, _ctx: ExprContext): ExprValue {
    return null;
  },
  evaluateSource(_source: string, _ctx: ExprContext): ExprValue {
    return null;
  },
  toSql(_expr: CompiledExpr, _fieldTypes: Record<string, import('@/platform/expr').ExprType>) {
    return null;
  },
};

/** ExprEngine that evaluates simple equality conditions like "status = 'Approved'" */
export function makeSimpleExprEngine(overrides?: Partial<ExprEngine>): ExprEngine {
  return {
    ...noopExprEngine,
    evaluateSource(source: string, ctx: ExprContext): ExprValue {
      // Handle simple lock conditions: "field = 'value'"
      const match = /^(\w+)\s*=\s*'([^']*)'$/.exec(source.trim());
      if (match && ctx.record) {
        return ctx.record[match[1]] === match[2];
      }
      // Handle simple boolean conditions
      if (source.trim() === 'true') return true;
      if (source.trim() === 'false') return false;
      return null;
    },
    evaluate(expr: CompiledExpr, ctx: ExprContext): ExprValue {
      return (overrides?.evaluateSource ?? this.evaluateSource)(expr.source, ctx);
    },
    ...overrides,
  };
}

/** Drop a tenant schema (cleanup after tests) */
export async function dropSchema(pool: Pool, slug: string): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS "tenant_${slug}" CASCADE`);
}

/** Clean the sequences and audit_log tables for a test run */
export async function cleanPlatformTables(pool: Pool, appId: string): Promise<void> {
  await pool.query(`DELETE FROM public.sequences WHERE app_id = $1`, [appId]);
  await pool.query(`DELETE FROM public.audit_log WHERE tenant_schema LIKE 'tenant_%'`);
}
