/**
 * POST /api/runtime/finance/bank-recon/confirm
 * Body: { tenantSlug, ledgerTable, matchedIds: string[] }
 * Marks ledger entries as reconciled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ledgerTable, matchedIds } = body as {
    ledgerTable?: string;
    matchedIds?: string[];
  };

  if (!matchedIds?.length) {
    return NextResponse.json({ error: 'matchedIds are required' }, { status: 400 });
  }

  const schemaName = ctx.schemaName;
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
