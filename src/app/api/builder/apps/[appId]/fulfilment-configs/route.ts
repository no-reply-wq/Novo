import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const result = await pgPool.query(`SELECT * FROM platform.fulfilment_configs WHERE app_id = $1 ORDER BY created_at DESC`, [appId]);
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as { name?: string; chain?: unknown[] };
  if (!body.name || !Array.isArray(body.chain) || body.chain.length < 2) return NextResponse.json({ error: 'name and chain (at least 2 stages) are required' }, { status: 400 });
  const result = await pgPool.query(
    `INSERT INTO platform.fulfilment_configs (id, app_id, name, chain) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
    [appId, body.name, JSON.stringify(body.chain)],
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}
