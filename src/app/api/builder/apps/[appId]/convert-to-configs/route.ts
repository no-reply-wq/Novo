import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const result = await pgPool.query(`SELECT * FROM platform.convert_to_configs WHERE app_id = $1 ORDER BY created_at DESC`, [appId]);
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as { sourceTableId?: string; targetTableId?: string; headerMappings?: unknown[]; lineMappings?: unknown[]; linkBackField?: string; respectFulfilment?: boolean };
  if (!body.sourceTableId || !body.targetTableId || !body.linkBackField) return NextResponse.json({ error: 'sourceTableId, targetTableId, and linkBackField are required' }, { status: 400 });
  const result = await pgPool.query(
    `INSERT INTO platform.convert_to_configs (id, app_id, source_table_id, target_table_id, header_mappings, line_mappings, link_back_field, respect_fulfilment)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [appId, body.sourceTableId, body.targetTableId, JSON.stringify(body.headerMappings ?? []), JSON.stringify(body.lineMappings ?? []), body.linkBackField, body.respectFulfilment ?? false],
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}
