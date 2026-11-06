/**
 * Builder API — Convert-to configs for an app.
 * GET  /api/builder/apps/[appId]/convert-to-configs  — list convert-to configs
 * POST /api/builder/apps/[appId]/convert-to-configs  — create a convert-to config
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import type { ConvertToConfig } from '@/platform/stock/convert-to';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;

  const result = await pgPool.query<{
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
     WHERE app_id = $1
     ORDER BY created_at`,
    [appId],
  );

  const configs: ConvertToConfig[] = result.rows.map((r) => ({
    id: r.id,
    sourceTableId: r.source_table_id,
    targetTableId: r.target_table_id,
    headerMappings: r.header_mappings,
    lineMappings: r.line_mappings ?? undefined,
    linkBackField: r.link_back_field,
    respectFulfilment: r.respect_fulfilment,
  }));

  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cfg = body as Partial<ConvertToConfig>;

  if (
    !cfg.sourceTableId ||
    !cfg.targetTableId ||
    !Array.isArray(cfg.headerMappings) ||
    !cfg.linkBackField
  ) {
    return NextResponse.json(
      { error: 'sourceTableId, targetTableId, headerMappings, linkBackField are required' },
      { status: 400 },
    );
  }

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.convert_to_configs
       (app_id, source_table_id, target_table_id, header_mappings, line_mappings,
        link_back_field, respect_fulfilment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      appId,
      cfg.sourceTableId,
      cfg.targetTableId,
      JSON.stringify(cfg.headerMappings),
      cfg.lineMappings ? JSON.stringify(cfg.lineMappings) : null,
      cfg.linkBackField,
      cfg.respectFulfilment ?? false,
    ],
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
