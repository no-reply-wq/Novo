import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

type Params = { appId: string; configId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, configId } = await params;
  const result = await pgPool.query(
    `SELECT * FROM platform.fulfilment_configs WHERE id = $1 AND app_id = $2`,
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
  const body = (await req.json()) as { name?: string; config?: unknown };
  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    values.push(body.name);
    fields.push(`name = $${values.length}`);
  }
  if (body.config !== undefined) {
    values.push(JSON.stringify(body.config));
    fields.push(`config = $${values.length}`);
  }
  if (!fields.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(configId, appId);
  const result = await pgPool.query(
    `UPDATE platform.fulfilment_configs SET ${fields.join(', ')}, updated_at = now()
     WHERE id = $${values.length - 1} AND app_id = $${values.length}
     RETURNING *`,
    values,
  );
  if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, configId } = await params;
  await pgPool.query(
    `DELETE FROM platform.fulfilment_configs WHERE id = $1 AND app_id = $2`,
    [configId, appId],
  );
  return new NextResponse(null, { status: 204 });
}
