import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { convertTo } from '@/platform/stock/convert-to';
import type { ConvertToConfig } from '@/platform/stock/convert-to';
import { requireTenantSession } from '@/lib/auth/tenant-session';

interface ConvertToRow { id: string; source_table_id: string; target_table_id: string; header_mappings: unknown; line_mappings: unknown; link_back_field: string; respect_fulfilment: boolean; }

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as { configId?: string; sourceRecordIds?: string[] };
  if (!body.configId || !Array.isArray(body.sourceRecordIds) || body.sourceRecordIds.length === 0) return NextResponse.json({ error: 'configId and sourceRecordIds are required' }, { status: 400 });
  const configResult = await pgPool.query<ConvertToRow>(`SELECT * FROM platform.convert_to_configs WHERE id = $1`, [body.configId]);
  if (configResult.rows.length === 0) return NextResponse.json({ error: 'Config not found' }, { status: 404 });
  const row = configResult.rows[0];
  const config: ConvertToConfig = { id: row.id, sourceTableId: row.source_table_id, targetTableId: row.target_table_id, headerMappings: row.header_mappings as ConvertToConfig['headerMappings'], lineMappings: row.line_mappings as ConvertToConfig['lineMappings'], linkBackField: row.link_back_field, respectFulfilment: row.respect_fulfilment };
  const result = await convertTo(pgPool, ctx.tenant.slug, config, body.sourceRecordIds, ctx.userId);
  return NextResponse.json(result, { status: 201 });
}
