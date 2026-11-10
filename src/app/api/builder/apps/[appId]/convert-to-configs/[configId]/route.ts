import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';

type Params = { appId: string; configId: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, configId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const result = await pgPool.query(
    `SELECT * FROM platform.convert_to_configs WHERE id = $1 AND app_id = $2`,
    [configId, appId],
  );
  if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, configId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as {
    name?: string;
    sourceTableId?: string;
    targetTableId?: string;
    headerMappings?: unknown[];
    lineMappings?: unknown[];
    linkBackField?: string;
    respectFulfilment?: boolean;
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) { values.push(body.name); fields.push(`name = $${values.length}`); }
  if (body.sourceTableId !== undefined) { values.push(body.sourceTableId); fields.push(`source_table_id = $${values.length}`); }
  if (body.targetTableId !== undefined) { values.push(body.targetTableId); fields.push(`target_table_id = $${values.length}`); }
  if (body.headerMappings !== undefined) { values.push(JSON.stringify(body.headerMappings)); fields.push(`header_mappings = $${values.length}`); }
  if (body.lineMappings !== undefined) { values.push(JSON.stringify(body.lineMappings)); fields.push(`line_mappings = $${values.length}`); }
  if (body.linkBackField !== undefined) { values.push(body.linkBackField); fields.push(`link_back_field = $${values.length}`); }
  if (body.respectFulfilment !== undefined) { values.push(body.respectFulfilment); fields.push(`respect_fulfilment = $${values.length}`); }

  if (!fields.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(configId, appId);
  const result = await pgPool.query(
    `UPDATE platform.convert_to_configs SET ${fields.join(', ')}, updated_at = now()
     WHERE id = $${values.length - 1} AND app_id = $${values.length}
     RETURNING *`,
    values,
  );
  if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, configId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  await pgPool.query(
    `DELETE FROM platform.convert_to_configs WHERE id = $1 AND app_id = $2`,
    [configId, appId],
  );
  return new NextResponse(null, { status: 204 });
}
