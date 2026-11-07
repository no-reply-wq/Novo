import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

type Params = Promise<{ appId: string; configId: string }>;

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { appId, configId } = await params;
  try {
    const body = (await req.json()) as { tableId?: string; config?: Record<string, unknown> };
    if (!body.config) {
      return NextResponse.json({ error: 'config is required' }, { status: 400 });
    }
    const result = await pgPool.query(
      `UPDATE platform.stock_configs SET config = $1, updated_at = NOW() WHERE id = $2 AND app_id = $3 RETURNING *`,
      [JSON.stringify(body.config), configId, appId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { appId, configId } = await params;
  try {
    const result = await pgPool.query(
      `DELETE FROM platform.stock_configs WHERE id = $1 AND app_id = $2 RETURNING id`,
      [configId, appId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
