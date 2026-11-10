/**
 * POST /api/runtime/finance/bank-recon/match
 * Body: { appId, tenantSlug, ledgerTable, statements: BankStatement[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { reconcileStatements } from '@/platform/finance/bank-recon';
import type { BankStatement } from '@/platform/finance/bank-recon';
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

  const { appId, ledgerTable, statements } = body as {
    appId?: string;
    ledgerTable?: string;
    statements?: BankStatement[];
  };

  if (!appId || !statements?.length) {
    return NextResponse.json({ error: 'appId and statements are required' }, { status: 400 });
  }

  try {
    const matches = await reconcileStatements(
      statements,
      appId,
      ctx.tenant.slug,
      ledgerTable ?? 'ledger',
      pgPool,
    );
    const summary = {
      total: matches.length,
      matched: matches.filter((m) => m.status === 'matched').length,
      partial: matches.filter((m) => m.status === 'partial').length,
      unmatched: matches.filter((m) => m.status === 'unmatched').length,
    };
    return NextResponse.json({ summary, matches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
