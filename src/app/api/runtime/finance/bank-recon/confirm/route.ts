/**
 * POST /api/runtime/finance/bank-recon/confirm
 * Body: { tenantSlug, ledgerTable, matchedIds: string[] }
 * Marks ledger entries as reconciled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tenantSlug, ledgerTable, matchedIds } = body as {
    tenantSlug?: string;
    ledgerTable?: string;
    matchedIds?: string[];
  };

  if (!tenantSlug || !matchedIds?.length) {
    return NextResponse.json({ error: 'tenantSlug and matchedIds are required' }, { status: 400 });
  }

  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  const table = ledgerTable ?? 'ledger';

  try {
    const result = await pgPool.query(
      `UPDATE ${schemaName}.${table}
          SET reconciled = true, reconciled_at = now()
        WHERE id = ANY($1::text[])`,
      [matchedIds],
    );
    return NextResponse.json({ updated: result.rowCount ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
