/**
 * GET /api/runtime/finance/exchange-rate?from=USD&to=INR&date=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getExchangeRate } from '@/platform/finance/currency';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const date = searchParams.get('date') ?? undefined;

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to currency codes are required' }, { status: 400 });
  }

  try {
    const rate = await getExchangeRate(from, to, date, pgPool);
    return NextResponse.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate, date: date ?? new Date().toISOString().slice(0, 10) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
