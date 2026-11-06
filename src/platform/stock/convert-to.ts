/**
 * Convert-to engine — Wave 10 public API.
 *
 * Thin façade over src/platform/engines/convert/ that exposes the
 * ConvertToConfig type used by the builder API and the convertTo runtime helper.
 */

import { Pool } from 'pg';
import { convertRecords } from '@/platform/engines/convert/converter';
import type { ConvertConfig, ConvertResult } from '@/platform/engines/convert/types';
import type { CrudContext } from '@/platform/data/crud';
import type { ExprEngine } from '@/platform/expr';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ConvertToFieldMapping {
  sourceField: string;
  targetField: string;
  /** Optional expression to transform the value */
  transformExpr?: string;
}

export interface ConvertToLineMapping {
  sourceChildTable: string;
  targetChildTable: string;
  fieldMappings: ConvertToFieldMapping[];
}

export interface ConvertToConfig {
  id: string;
  sourceTableId: string;
  targetTableId: string;
  headerMappings: ConvertToFieldMapping[];
  lineMappings?: ConvertToLineMapping[];
  /**
   * Field on the target record that stores the source record ID.
   * Used to link back (e.g. po.indent_id = indent.id).
   */
  linkBackField: string;
  /**
   * When true, only copy the pending (un-fulfilled) qty from each source line
   * rather than the full ordered qty.
   */
  respectFulfilment: boolean;
}

export interface ConvertToResult {
  createdRecordId: string;
  lines: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildConvertConfig(
  config: ConvertToConfig,
): ConvertConfig {
  const lineMapping = config.lineMappings?.[0];

  return {
    id: config.id,
    name: config.id,
    sourceTableId: config.sourceTableId,
    targetTableId: config.targetTableId,
    sourceLineTableId: lineMapping?.sourceChildTable,
    targetLineTableId: lineMapping?.targetChildTable,
    headerFieldMapping: [
      // Always link back to source
      { sourceFieldId: 'id', targetFieldId: config.linkBackField },
      ...config.headerMappings.map((m) => ({
        sourceFieldId: m.sourceField,
        targetFieldId: m.targetField,
        transformExpr: m.transformExpr,
      })),
    ],
    lineFieldMapping: lineMapping?.fieldMappings.map((m) => ({
      sourceFieldId: m.sourceField,
      targetFieldId: m.targetField,
      transformExpr: m.transformExpr,
    })),
    createFulfilmentLinks: config.respectFulfilment,
  };
}

function makePassthroughExprEngine(): ExprEngine {
  return {
    parse: () => ({ source: '', resultType: 'any' as import('@/platform/expr').ExprType }),
    typeCheck: () => ({
      ok: true,
      inferredType: 'any' as import('@/platform/expr').ExprType,
      errors: [],
      warnings: [],
    }),
    evaluate: (_node, ctx) => ctx.vars?.['value'] ?? null,
    evaluateSource: (_source, ctx) => ctx.vars?.['value'] ?? null,
    toSql: () => null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create target record(s) from one or many source records.
 *
 * All source records produce a single merged target header; lines from each
 * source are collected and copied to the target child table.
 *
 * When respectFulfilment is true, createFulfilmentLinks is set so that
 * the fulfilment engine tracks which lines have been converted.
 */
export async function convertTo(
  pool: Pool,
  tenantSlug: string,
  config: ConvertToConfig,
  sourceRecordIds: string[],
  userId: string,
  overrides?: Record<string, unknown>,
): Promise<ConvertToResult> {
  if (sourceRecordIds.length === 0) {
    throw new Error('convertTo: sourceRecordIds must not be empty');
  }

  const convertConfig = buildConvertConfig(config);

  const ctx: CrudContext = {
    userId,
    claims: { userId, roles: ['system'], locations: [] },
    ...(overrides ?? {}),
  };

  const exprEngine = makePassthroughExprEngine();

  const result: ConvertResult = await convertRecords(
    pool,
    tenantSlug,
    convertConfig,
    sourceRecordIds,
    ctx,
    exprEngine,
  );

  return {
    createdRecordId: result.targetRecordId,
    lines: result.targetLineRecordIds.length,
  };
}

// Re-export the lower-level converter for direct use
export { convertRecords };
export type { ConvertConfig, ConvertResult };
