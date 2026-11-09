/**
 * POST /api/runtime/finance/exchange-rates/sync
 * Fetches latest rates for common currencies and caches them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getExchangeRate } from '@/platform/finance/currency';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

const PAIRS = [
  ['USD', 'INR'], ['EUR', 'INR'], ['GBP', 'INR'], ['AED', 'INR'],
  ['SGD', 'INR'], ['AUD', 'INR'], ['CAD', 'INR'], ['JPY', 'INR'],
  ['INR', 'USD'], ['INR', 'EUR'],
];

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const today = new Date().toISOString().slice(0, 10);
  const results: { pair: string; rate: number }[] = [];
  const errors: { pair: string; error: string }[] = [];

  await Promise.all(
    PAIRS.map(async ([from, to]) => {
      try {
        const rate = await getExchangeRate(from, to, today, pgPool);
        results.push({ pair: `${from}/${to}`, rate });
      } catch (err) {
        errors.push({ pair: `${from}/${to}`, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }),
  );

  return NextResponse.json({ synced: results.length, errors, date: today });
}
