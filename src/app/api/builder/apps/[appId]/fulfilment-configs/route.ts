/**
 * Builder API — Fulfilment configs for an app.
 * GET  /api/builder/apps/[appId]/fulfilment-configs  — list fulfilment chains
 * POST /api/builder/apps/[appId]/fulfilment-configs  — create a fulfilment chain
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import type { FulfilmentConfig, FulfilmentStage } from '@/platform/stock/fulfilment';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;

  const result = await pgPool.query<{
    id: string;
    name: string;
    chain: FulfilmentStage[];
  }>(
    `SELECT id, name, chain
     FROM platform.fulfilment_configs
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

  const { name, chain } = body as Partial<FulfilmentConfig>;

  if (!name || !Array.isArray(chain) || chain.length < 2) {
    return NextResponse.json(
      { error: 'name and chain (at least 2 stages) are required' },
      { status: 400 },
    );
  }

  for (const stage of chain) {
    if (!stage.tableId || !stage.qtyField || !stage.linkField) {
      return NextResponse.json(
        { error: 'Each stage must have tableId, qtyField, and linkField' },
        { status: 400 },
      );
    }
  }

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO platform.fulfilment_configs (app_id, name, chain)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [appId, name, JSON.stringify(chain)],
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
