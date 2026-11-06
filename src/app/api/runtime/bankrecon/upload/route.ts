import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { parseBankStatement, detectBankFormat } from '@/platform/integrations/bankrecon/parsers/csv-parser';
import { matchTransactions, normalizeAmount } from '@/platform/integrations/bankrecon/matcher';
import { tenantQuery } from '@/lib/db/client';
import { prisma } from '@/lib/db/client';
import type { BankFormat } from '@/platform/integrations/bankrecon/parsers/csv-parser';
import type { LedgerEntry } from '@/platform/integrations/bankrecon/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const bankFormatRaw = formData.get('bankFormat') as string | null;
  const ledgerTableId = formData.get('ledgerTableId') as string | null;
  const fieldMappingRaw = formData.get('fieldMapping') as string | null;

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing file upload' }, { status: 400 });
  }
  if (!ledgerTableId) {
    return NextResponse.json({ error: 'Missing ledgerTableId' }, { status: 400 });
  }
  if (!fieldMappingRaw) {
    return NextResponse.json({ error: 'Missing fieldMapping' }, { status: 400 });
  }

  let fieldMapping: Record<string, string>;
  try {
    fieldMapping = JSON.parse(fieldMappingRaw) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'Invalid fieldMapping JSON' }, { status: 400 });
  }

  const csvContent = await (file as Blob).text();

  // Detect format or use provided
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerLine = lines[0] ?? '';
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const bankFormat: BankFormat = (bankFormatRaw as BankFormat | null) ?? detectBankFormat(headers);

  const bankTransactions = parseBankStatement(csvContent, bankFormat);

  // Load ledger entries from tenant schema
  const dateField = fieldMapping['date'] ?? 'date';
  const amountField = fieldMapping['amount'] ?? 'amount';
  const descField = fieldMapping['description'] ?? 'description';
  const refField = fieldMapping['referenceNumber'];
  const reconStatusField = fieldMapping['reconStatus'];

  const selectParts = [
    `id`,
    `${dateField} AS date`,
    `${amountField} AS amount`,
    `${descField} AS description`,
  ];
  if (refField) selectParts.push(`${refField} AS reference_number`);
  if (reconStatusField) selectParts.push(`${reconStatusField} AS recon_status`);

  const ledgerResult = await tenantQuery<Record<string, unknown>>(
    ctx.schemaName,
    `SELECT ${selectParts.join(', ')} FROM ${ledgerTableId}`,
  );

  const ledgerEntries: LedgerEntry[] = ledgerResult.rows.map((row) => {
    const rawAmount = typeof row['amount'] === 'number'
      ? row['amount'] as number
      : parseFloat(String(row['amount'] ?? '0'));

    return {
      id: String(row['id']),
      date: String(row['date'] ?? ''),
      description: String(row['description'] ?? ''),
      amount: rawAmount,
      referenceNumber: row['reference_number'] != null ? String(row['reference_number']) : undefined,
      isReconciled: Boolean(row['recon_status']),
    };
  });

  const matches = matchTransactions({ bankTransactions, ledgerEntries });

  const matchedCount = matches.filter((m) => m.status !== 'unmatched').length;
  const unmatchedCount = matches.filter((m) => m.status === 'unmatched').length;

  // Determine statement period
  const dates = bankTransactions.map((t) => t.date).sort();
  const statementPeriod = {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
  };

  const session = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO platform.bankrecon_sessions
      (tenant_slug, bank_name, statement_period, total_transactions, matched_count, unmatched_count, matches, status)
    VALUES
      (${ctx.tenant.slug}, ${bankFormat}, ${JSON.stringify(statementPeriod)},
       ${bankTransactions.length}, ${matchedCount}, ${unmatchedCount},
       ${JSON.stringify(matches)}::jsonb, 'pending')
    RETURNING id
  `;

  const sessionId = session[0]?.id ?? '';

  return NextResponse.json({
    sessionId,
    totalTransactions: bankTransactions.length,
    matchedCount,
    unmatchedCount,
    matches,
    statementPeriod,
  });
}
