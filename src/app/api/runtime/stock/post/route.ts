import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { postStockMovement } from '@/platform/engines/stock/engine';
import type { StockMovementConfig } from '@/platform/engines/stock/types';
import { InsufficientStockError } from '@/platform/engines/stock/errors';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function POST(req: NextRequest) {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as {
      config: StockMovementConfig;
      record: Record<string, unknown>;
    };
    if (!body.config || !body.record) {
      return NextResponse.json({ error: 'config and record required' }, { status: 400 });
    }
    const result = await postStockMovement(body.config, body.record, ctx.userId, ctx.tenant.slug, pgPool);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
