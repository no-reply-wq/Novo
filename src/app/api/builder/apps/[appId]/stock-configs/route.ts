/**
 * Builder API — Stock configs for an app.
 * GET  /api/builder/apps/[appId]/stock-configs  — list all stock configs for the app
 * POST /api/builder/apps/[appId]/stock-configs  — create or update a stock config
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import type { StockConfig } from '@/platform/stock/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;

  const result = await pgPool.query<{ id: string; table_id: string; config: StockConfig }>(
    `SELECT id, table_id, config
     FROM platform.stock_configs
     WHERE app_id = $1
     ORDER BY created_at`,
    [appId],
  );

  return NextResponse.json({ configs: result.rows });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tableId, config } = body as { tableId?: string; config?: StockConfig };

  if (!tableId || !config) {
    return NextResponse.json({ error: 'tableId and config are required' }, { status: 400 });
  }

  if (!config.itemField || !config.locationField || !config.qtyField || !config.direction) {
    return NextResponse.json(
      { error: 'config must include itemField, locationField, qtyField, direction' },
      { status: 400 },
    );
  }

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.stock_configs (app_id, table_id, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (table_id) DO UPDATE SET config = EXCLUDED.config
     RETURNING id`,
    [appId, tableId, JSON.stringify(config)],
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
