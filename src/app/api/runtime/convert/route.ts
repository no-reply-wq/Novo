/**
 * Runtime convert-to API.
 *
 * POST /api/runtime/convert
 * Body: { configId, sourceRecordIds, overrides, tenantSlug, userId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { convertRecords } from '@/platform/engines/convert/converter';
import type { ConvertConfig } from '@/platform/engines/convert/types';
import type { CrudContext } from '@/platform/data/crud';
import type { ExprEngine, ExprValue, ExprContext } from '@/platform/expr';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

// Minimal no-op expression engine — returns the source value unchanged.
function makeNoopExprEngine(): ExprEngine {
  return {
    evaluateSource: (_expr: string, ctx: ExprContext): ExprValue =>
      (ctx.vars as Record<string, ExprValue> | undefined)?.['value'] ?? null,
  } as unknown as ExprEngine;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authCtx = await requireSessionTenant();
  if (authCtx instanceof NextResponse) return authCtx;
  try {
    const body = (await req.json()) as {
      configId?: string;
      sourceRecordIds?: string[];
      overrides?: Record<string, unknown>;
    };

    const { configId, sourceRecordIds } = body;
    const tenantSlug = authCtx.tenant.slug;
    const userId = authCtx.userId;

    if (!configId || !Array.isArray(sourceRecordIds) || sourceRecordIds.length === 0) {
      return NextResponse.json(
        { error: 'configId and sourceRecordIds (non-empty) are required' },
        { status: 400 },
      );
    }

    // Load config from platform DB
    const configRes = await pgPool.query<{
      id: string;
      app_id: string;
      name: string;
      source_table_id: string;
      target_table_id: string;
      header_mappings: Array<{ sourceFieldId: string; targetFieldId: string; transformExpr?: string }>;
      line_mappings: Array<{ sourceFieldId: string; targetFieldId: string; transformExpr?: string }>;
      link_back_field: string | null;
      respect_fulfilment: boolean;
    }>(
      `SELECT * FROM platform.convert_to_configs WHERE id = $1`,
      [configId],
    );

    if (!configRes.rows.length) {
      return NextResponse.json({ error: 'Convert config not found' }, { status: 404 });
    }

    const row = configRes.rows[0];
    const config: ConvertConfig = {
      id: row.id,
      name: row.name,
      sourceTableId: row.source_table_id,
      targetTableId: row.target_table_id,
      headerFieldMapping: Array.isArray(row.header_mappings) ? row.header_mappings : [],
      lineFieldMapping: Array.isArray(row.line_mappings) ? row.line_mappings : [],
      createFulfilmentLinks: row.respect_fulfilment ?? false,
    };

    const ctx: CrudContext = {
      userId,
      claims: { userId, roles: [], locations: [] },
      now: new Date(),
    };

    const result = await convertRecords(
      pgPool,
      tenantSlug,
      config,
      sourceRecordIds,
      ctx,
      makeNoopExprEngine(),
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
