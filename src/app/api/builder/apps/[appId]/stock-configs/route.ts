import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const result = await pgPool.query(`SELECT * FROM platform.stock_configs WHERE app_id = $1 ORDER BY created_at DESC`, [appId]);
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as { tableId?: string; config?: Record<string, unknown> };
  if (!body.tableId || !body.config) return NextResponse.json({ error: 'tableId and config are required' }, { status: 400 });
  const result = await pgPool.query(
    `INSERT INTO platform.stock_configs (id, app_id, table_id, config) VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (table_id) DO UPDATE SET config = EXCLUDED.config RETURNING *`,
    [appId, body.tableId, JSON.stringify(body.config)],
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}
