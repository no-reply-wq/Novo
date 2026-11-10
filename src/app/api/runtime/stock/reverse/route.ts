import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { reverseStockMovement } from '@/platform/engines/stock/engine';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function POST(req: NextRequest) {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as { ledgerId: string };
    if (!body.ledgerId) {
      return NextResponse.json({ error: 'ledgerId required' }, { status: 400 });
    }
    await reverseStockMovement(body.ledgerId, ctx.userId, pgPool);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
