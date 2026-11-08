/**
 * GET /api/runtime/finance/pnl?appId=&tenantSlug=&from=&to=
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildPnlReport } from '@/platform/finance/pnl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const appId = searchParams.get('appId') ?? '';
  const tenantSlug = searchParams.get('tenantSlug') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const revenueTableApiKey = searchParams.get('revenueTable') ?? 'sales_invoices';
  const expenseTableApiKey = searchParams.get('expenseTable') ?? 'expenses';
  const amountField = searchParams.get('amountField') ?? 'amount';
  const categoryField = searchParams.get('categoryField') ?? 'category';

  if (!appId || !tenantSlug || !from || !to) {
    return NextResponse.json({ error: 'appId, tenantSlug, from and to are required' }, { status: 400 });
  }

  try {
    const report = await buildPnlReport(
      appId,
      tenantSlug,
      { from, to, revenueTableApiKey, expenseTableApiKey, amountField, categoryField },
      pgPool,
    );
    return NextResponse.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
