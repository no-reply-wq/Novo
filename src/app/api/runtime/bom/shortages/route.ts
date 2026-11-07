import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { checkBomShortages } from '@/platform/engines/bom/engine';
import type { Bom } from '@/platform/engines/bom/engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      bom: Bom;
      targetQty: number;
      locationId: string;
      appId: string;
    };
    if (!body.bom || body.targetQty == null || !body.locationId || !body.appId) {
      return NextResponse.json({ error: 'bom, targetQty, locationId, appId required' }, { status: 400 });
    }
    const shortages = await checkBomShortages(body.bom, body.targetQty, body.locationId, body.appId, pgPool);
    return NextResponse.json({ shortages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
