import { Pool } from 'pg';
import { convertRecords } from '@/platform/engines/convert/converter';
import type { ConvertConfig, ConvertResult } from '@/platform/engines/convert/types';
import type { CrudContext } from '@/platform/data/crud';
import type { ExprEngine } from '@/platform/expr';

export interface ConvertToFieldMapping { sourceField: string; targetField: string; transformExpr?: string; }
export interface ConvertToLineMapping { sourceChildTable: string; targetChildTable: string; fieldMappings: ConvertToFieldMapping[]; }
export interface ConvertToConfig {
  id: string; sourceTableId: string; targetTableId: string;
  headerMappings: ConvertToFieldMapping[]; lineMappings?: ConvertToLineMapping[];
  linkBackField: string; respectFulfilment: boolean;
}
export interface ConvertToResult { createdRecordId: string; lines: number; }

function buildConvertConfig(config: ConvertToConfig): ConvertConfig {
  const lineMapping = config.lineMappings?.[0];
  return {
    id: config.id, name: config.id,
    sourceTableId: config.sourceTableId, targetTableId: config.targetTableId,
    sourceLineTableId: lineMapping?.sourceChildTable,
    targetLineTableId: lineMapping?.targetChildTable,
    headerFieldMapping: [
      { sourceFieldId: 'id', targetFieldId: config.linkBackField },
      ...config.headerMappings.map((m) => ({ sourceFieldId: m.sourceField, targetFieldId: m.targetField, transformExpr: m.transformExpr })),
    ],
    lineFieldMapping: lineMapping?.fieldMappings.map((m) => ({ sourceFieldId: m.sourceField, targetFieldId: m.targetField, transformExpr: m.transformExpr })),
    createFulfilmentLinks: config.respectFulfilment,
  };
}

function makePassthroughExprEngine(): ExprEngine {
  return {
    parse: () => ({ source: '', resultType: 'any' as import('@/platform/expr').ExprType }),
    typeCheck: () => ({ ok: true, inferredType: 'any' as import('@/platform/expr').ExprType, errors: [], warnings: [] }),
    evaluate: (_node, ctx) => ctx.vars?.['value'] ?? null,
    evaluateSource: (_source, ctx) => ctx.vars?.['value'] ?? null,
    toSql: () => null,
  };
}

export async function convertTo(
  pool: Pool, tenantSlug: string, config: ConvertToConfig,
  sourceRecordIds: string[], userId: string, overrides?: Record<string, unknown>,
): Promise<ConvertToResult> {
  if (sourceRecordIds.length === 0) throw new Error('convertTo: sourceRecordIds must not be empty');
  const convertConfig = buildConvertConfig(config);
  const ctx: CrudContext = { userId, claims: { userId, roles: ['system'], locations: [] }, ...(overrides ?? {}) };
  const exprEngine = makePassthroughExprEngine();
  const result: ConvertResult = await convertRecords(pool, tenantSlug, convertConfig, sourceRecordIds, ctx, exprEngine);
  return { createdRecordId: result.targetRecordId, lines: result.targetLineRecordIds.length };
}

export { convertRecords };
export type { ConvertConfig, ConvertResult };
