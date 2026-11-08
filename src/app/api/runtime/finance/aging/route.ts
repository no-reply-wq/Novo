/**
 * GET /api/runtime/finance/aging?appId=&tenantSlug=&invoiceTable=&partyType=customer
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { buildAgingReport } from '@/platform/finance/aging';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const appId = searchParams.get('appId') ?? '';
  const tenantSlug = searchParams.get('tenantSlug') ?? '';
  const invoiceTable = searchParams.get('invoiceTable') ?? 'invoices';
  const partyType = (searchParams.get('partyType') ?? 'customer') as 'customer' | 'supplier';
  const asOf = searchParams.get('asOf') ?? undefined;
  const dueDateField = searchParams.get('dueDateField') ?? 'due_date';
  const amountField = searchParams.get('amountField') ?? 'amount';
  const partyField = searchParams.get('partyField') ?? (partyType === 'customer' ? 'customer_name' : 'supplier_name');

  if (!appId || !tenantSlug) {
    return NextResponse.json({ error: 'appId and tenantSlug are required' }, { status: 400 });
  }

  try {
    const report = await buildAgingReport(
      appId,
      tenantSlug,
      { partyType, invoiceTableApiKey: invoiceTable, dueDateField, amountField, partyField, asOf },
      pgPool,
    );
    return NextResponse.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
