import { NextRequest, NextResponse } from 'next/server';
import { scaleBom } from '@/platform/engines/bom/engine';
import type { Bom } from '@/platform/engines/bom/engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { bom: Bom; targetQty: number };
    if (!body.bom || body.targetQty == null) {
      return NextResponse.json({ error: 'bom and targetQty required' }, { status: 400 });
    }
    const scaled = scaleBom(body.bom, body.targetQty);
    return NextResponse.json({ scaled });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
