import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { reverseStockMovement } from '@/platform/engines/stock/engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ledgerId: string; userId: string };
    if (!body.ledgerId || !body.userId) {
      return NextResponse.json({ error: 'ledgerId and userId required' }, { status: 400 });
    }
    await reverseStockMovement(body.ledgerId, body.userId, pgPool);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
