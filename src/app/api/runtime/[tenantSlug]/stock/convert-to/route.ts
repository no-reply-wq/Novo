/**
 * Runtime API — Convert-to operation.
 * POST /api/runtime/[tenantSlug]/stock/convert-to
 * Body: { configId: string; sourceRecordIds: string[]; userId?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { convertTo } from '@/platform/stock/convert-to';
import type { ConvertToConfig } from '@/platform/stock/convert-to';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ tenantSlug: string }>;
}

interface RequestBody {
  configId: string;
  sourceRecordIds: string[];
  userId?: string;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { configId, sourceRecordIds, userId } = body as Partial<RequestBody>;

  if (!configId || !Array.isArray(sourceRecordIds) || sourceRecordIds.length === 0) {
    return NextResponse.json(
      { error: 'configId and sourceRecordIds (non-empty array) are required' },
      { status: 400 },
    );
  }

  // Load the config from the database
  const configResult = await pgPool.query<{
    id: string;
    source_table_id: string;
    target_table_id: string;
    header_mappings: ConvertToConfig['headerMappings'];
    line_mappings: ConvertToConfig['lineMappings'];
    link_back_field: string;
    respect_fulfilment: boolean;
  }>(
    `SELECT id, source_table_id, target_table_id, header_mappings,
            line_mappings, link_back_field, respect_fulfilment
     FROM platform.convert_to_configs
     WHERE id = $1`,
    [configId],
  );

  if (configResult.rows.length === 0) {
    return NextResponse.json({ error: `Convert-to config ${configId} not found` }, { status: 404 });
  }

  const r = configResult.rows[0];
  const config: ConvertToConfig = {
    id: r.id,
    sourceTableId: r.source_table_id,
    targetTableId: r.target_table_id,
    headerMappings: r.header_mappings,
    lineMappings: r.line_mappings ?? undefined,
    linkBackField: r.link_back_field,
    respectFulfilment: r.respect_fulfilment,
  };

  const result = await convertTo(
    pgPool,
    tenantSlug,
    config,
    sourceRecordIds,
    userId ?? 'system',
  );

  return NextResponse.json(result, { status: 201 });
}
