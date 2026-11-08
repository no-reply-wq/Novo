/**
 * Bank Reconciliation — parse CSV statements, match with ledger
 */

import { Pool } from 'pg';

export interface BankStatement {
  date: string;
  description: string;
  debit?: number;
  credit?: number;
  balance: number;
  reference?: string;
}

export interface ReconMatch {
  bankEntry: BankStatement;
  ledgerEntryId?: string;
  status: 'matched' | 'unmatched' | 'partial';
  difference?: number;
}

// ─────────────────────────────────────────────────────────────
// CSV Parser — handles HDFC, ICICI, SBI, Axis patterns
// ─────────────────────────────────────────────────────────────

function detectFormat(headers: string[]): 'hdfc' | 'icici' | 'sbi' | 'axis' | 'generic' {
  const h = headers.map((s) => s.toLowerCase().trim());
  if (h.includes('withdrawal amt.') || h.includes('deposit amt.')) return 'hdfc';
  if (h.includes('transaction remarks') && h.includes('withdrawal amount (inr)')) return 'icici';
  if (h.includes('debit') && h.includes('credit') && h.includes('balance')) {
    if (h.some((s) => s.includes('sbi'))) return 'sbi';
    if (h.some((s) => s.includes('axis'))) return 'axis';
    return 'generic';
  }
  return 'generic';
}

function parseRow(cells: string[], headers: string[], format: string): BankStatement | null {
  const idx = (name: string) =>
    headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase());

  const cell = (name: string): string => {
    const i = idx(name);
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  };

  const num = (s: string): number => {
    if (!s || s === '-' || s === '') return 0;
    return parseFloat(s.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
  };

  let date = '';
  let description = '';
  let debit: number | undefined;
  let credit: number | undefined;
  let balance = 0;
  let reference: string | undefined;

  if (format === 'hdfc') {
    date = cell('Date') || cell('Value Date');
    description = cell('Narration') || cell('Description');
    const wd = cell('Withdrawal Amt.') || cell('Debit');
    const dep = cell('Deposit Amt.') || cell('Credit');
    debit = num(wd) || undefined;
    credit = num(dep) || undefined;
    balance = num(cell('Closing Balance') || cell('Balance'));
    reference = cell('Chq./Ref.No.');
  } else if (format === 'icici') {
    date = cell('Transaction Date') || cell('Value Date');
    description = cell('Transaction Remarks') || cell('Description');
    debit = num(cell('Withdrawal Amount (INR)')) || undefined;
    credit = num(cell('Deposit Amount (INR)')) || undefined;
    balance = num(cell('Balance (INR)') || cell('Balance'));
    reference = cell('S No.');
  } else {
    // SBI / Axis / generic
    date = cell('Date') || cell('Txn Date') || cell('Value Date');
    description = cell('Description') || cell('Particulars') || cell('Narration') || cell('Remarks');
    debit = num(cell('Debit') || cell('Withdrawal')) || undefined;
    credit = num(cell('Credit') || cell('Deposit')) || undefined;
    balance = num(cell('Balance'));
    reference = cell('Reference') || cell('Ref No') || cell('Cheque No');
  }

  if (!date) return null;

  // Normalize date to YYYY-MM-DD
  const parsedDate = (() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    // DD/MM/YYYY
    const parts = date.split(/[\/\-\.]/);
    if (parts.length === 3 && parts[0].length <= 2) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return date;
  })();

  return {
    date: parsedDate,
    description,
    debit: debit && debit > 0 ? debit : undefined,
    credit: credit && credit > 0 ? credit : undefined,
    balance,
    reference: reference || undefined,
  };
}

export async function parseBankStatementCsv(buffer: Buffer): Promise<BankStatement[]> {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) return [];

  // Find header row (first row with known columns)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = lines[i].split(',').map((s) => s.replace(/^"|"$/g, ''));
    if (cols.some((c) => /date|narration|debit|credit|balance/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = lines[headerIdx].split(',').map((s) => s.replace(/^"|"$/g, ''));
  const format = detectFormat(headers);
  const results: BankStatement[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((s) => s.replace(/^"|"$/g, ''));
    const entry = parseRow(cells, headers, format);
    if (entry) results.push(entry);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Reconciliation matching
// ─────────────────────────────────────────────────────────────

export async function reconcileStatements(
  bankStatements: BankStatement[],
  appId: string,
  tenantSlug: string,
  ledgerTableApiKey: string,
  pgPool: Pool,
): Promise<ReconMatch[]> {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  // Load ledger entries for the date range
  if (bankStatements.length === 0) return [];

  const dates = bankStatements.map((s) => s.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // Extend range by ±3 days for proximity matching
  const minD = new Date(minDate);
  minD.setDate(minD.getDate() - 3);
  const maxD = new Date(maxDate);
  maxD.setDate(maxD.getDate() + 3);

  const ledgerRows = await pgPool.query<Record<string, unknown>>(
    `SELECT
         id::text AS _id,
         COALESCE(date::date, transaction_date::date)::text AS _date,
         COALESCE(amount::numeric, debit::numeric, credit::numeric, 0) AS _amount,
         COALESCE(reference, ref_no, cheque_no, '') AS _ref,
         COALESCE(reconciled, false) AS _reconciled
       FROM ${schemaName}.${ledgerTableApiKey}
      WHERE COALESCE(date::date, transaction_date::date) BETWEEN $1 AND $2
        AND COALESCE(reconciled, false) = false`,
    [minD.toISOString().slice(0, 10), maxD.toISOString().slice(0, 10)],
  );

  // Build ledger lookup structures
  type LedgerRow = { id: string; date: string; amount: number; ref: string };
  const ledger: LedgerRow[] = ledgerRows.rows.map((r) => ({
    id: String(r['_id']),
    date: String(r['_date']),
    amount: Number(r['_amount']),
    ref: String(r['_ref'] ?? ''),
  }));

  const usedLedgerIds = new Set<string>();

  const matches: ReconMatch[] = bankStatements.map((bankEntry) => {
    const bankAmount = (bankEntry.debit ?? 0) + (bankEntry.credit ?? 0);
    const bankDate = new Date(bankEntry.date);

    // 1. Try exact match: amount + reference
    if (bankEntry.reference) {
      const refMatch = ledger.find(
        (l) =>
          !usedLedgerIds.has(l.id) &&
          l.ref === bankEntry.reference &&
          Math.abs(l.amount - bankAmount) < 0.01,
      );
      if (refMatch) {
        usedLedgerIds.add(refMatch.id);
        return { bankEntry, ledgerEntryId: refMatch.id, status: 'matched' as const };
      }
    }

    // 2. Try amount + date proximity (±3 days)
    const dateProximity = ledger.filter((l) => {
      if (usedLedgerIds.has(l.id)) return false;
      const lDate = new Date(l.date);
      const diffDays = Math.abs((bankDate.getTime() - lDate.getTime()) / 86400000);
      return diffDays <= 3 && Math.abs(l.amount - bankAmount) < 0.01;
    });

    if (dateProximity.length > 0) {
      const best = dateProximity.sort((a, b) => {
        const da = Math.abs(new Date(a.date).getTime() - bankDate.getTime());
        const db = Math.abs(new Date(b.date).getTime() - bankDate.getTime());
        return da - db;
      })[0];
      usedLedgerIds.add(best.id);
      return { bankEntry, ledgerEntryId: best.id, status: 'matched' as const };
    }

    // 3. Partial match: amount within 5% and date within ±3 days
    const partialMatch = ledger.find((l) => {
      if (usedLedgerIds.has(l.id)) return false;
      const lDate = new Date(l.date);
      const diffDays = Math.abs((bankDate.getTime() - lDate.getTime()) / 86400000);
      const diff = Math.abs(l.amount - bankAmount);
      const threshold = bankAmount * 0.05;
      return diffDays <= 3 && diff > 0 && diff <= threshold;
    });

    if (partialMatch) {
      usedLedgerIds.add(partialMatch.id);
      return {
        bankEntry,
        ledgerEntryId: partialMatch.id,
        status: 'partial' as const,
        difference: Math.abs(partialMatch.amount - bankAmount),
      };
    }

    return { bankEntry, status: 'unmatched' as const };
  });

  return matches;
}
