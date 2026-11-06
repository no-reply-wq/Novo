import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

interface ConfirmedMatch {
  bankTxnIndex: number;
  ledgerEntryId: string;
}

interface ConfirmBody {
  sessionId: string;
  confirmedMatches: ConfirmedMatch[];
  fieldMapping?: {
    reconStatus?: string;
    bankTransactionId?: string;
  };
  ledgerTableId: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, confirmedMatches, fieldMapping, ledgerTableId } = body as ConfirmBody;

  if (!sessionId || !Array.isArray(confirmedMatches) || !ledgerTableId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const reconStatusField = fieldMapping?.reconStatus;
  const bankTxnIdField = fieldMapping?.bankTransactionId;

  if (!reconStatusField) {
    return NextResponse.json({ error: 'fieldMapping.reconStatus is required' }, { status: 400 });
  }

  // Retrieve session matches to get bank transaction details
  const sessionRows = await prisma.$queryRaw<Array<{ matches: unknown; tenant_slug: string }>>`
    SELECT matches, tenant_slug FROM platform.bankrecon_sessions WHERE id = ${sessionId}::uuid
  `;
  if (!sessionRows.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (sessionRows[0].tenant_slug !== ctx.tenant.slug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update each confirmed ledger entry
  for (const cm of confirmedMatches) {
    const updateParts: string[] = [`${reconStatusField} = true`];
    const params: unknown[] = [cm.ledgerEntryId];

    if (bankTxnIdField) {
      const matches = sessionRows[0].matches as Array<{ bankTransaction: { referenceNumber?: string } }>;
      const match = matches[cm.bankTxnIndex];
      if (match?.bankTransaction?.referenceNumber) {
        updateParts.push(`${bankTxnIdField} = $${params.length + 1}`);
        params.push(match.bankTransaction.referenceNumber);
      }
    }

    await tenantQuery(
      ctx.schemaName,
      `UPDATE ${ledgerTableId} SET ${updateParts.join(', ')} WHERE id = $1`,
      params,
    );
  }

  // Mark session as completed
  await prisma.$executeRaw`
    UPDATE platform.bankrecon_sessions
    SET status = 'completed', matched_count = ${confirmedMatches.length}
    WHERE id = ${sessionId}::uuid
  `;

  return NextResponse.json({ success: true, confirmedCount: confirmedMatches.length });
}
