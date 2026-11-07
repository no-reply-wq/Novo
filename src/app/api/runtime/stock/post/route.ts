import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { postStockMovement } from '@/platform/engines/stock/engine';
import type { StockMovementConfig } from '@/platform/engines/stock/types';
import { InsufficientStockError } from '@/platform/engines/stock/errors';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      config: StockMovementConfig;
      record: Record<string, unknown>;
      userId: string;
      tenantSlug: string;
    };
    if (!body.config || !body.record || !body.userId || !body.tenantSlug) {
      return NextResponse.json({ error: 'config, record, userId, tenantSlug required' }, { status: 400 });
    }
    const result = await postStockMovement(body.config, body.record, body.userId, body.tenantSlug, pgPool);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
