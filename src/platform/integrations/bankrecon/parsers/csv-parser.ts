/**
 * Bank statement CSV parser.
 * Supports HDFC, ICICI, SBI, Axis, Kotak, and generic auto-detect formats.
 */

import type { BankTransaction } from '../types';

export type BankFormat =
  | 'hdfc_savings'
  | 'hdfc_current'
  | 'icici_savings'
  | 'sbi'
  | 'axis'
  | 'kotak'
  | 'generic';

/** Parse date strings from various bank formats to ISO YYYY-MM-DD */
export function parseStatementDate(dateStr: string): string {
  const s = dateStr.trim();

  // DD/MM/YYYY
  const slashDMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const matchSlash = slashDMY.exec(s);
  if (matchSlash) {
    const [, d, m, y] = matchSlash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY
  const dashDMY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const matchDash = dashDMY.exec(s);
  if (matchDash) {
    const [, d, m, y] = matchDash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD (already ISO)
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(s)) return s;

  // DD MMM YYYY e.g. "01 Jan 2024"
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const dmonthY = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/;
  const matchDMY = dmonthY.exec(s);
  if (matchDMY) {
    const [, d, mon, y] = matchDMY;
    const m = monthNames[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, '0')}`;
  }

  // Try native Date parse as fallback
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  throw new Error(`Cannot parse date: "${dateStr}"`);
}

/** Parse a numeric amount string, stripping commas and whitespace */
function parseAmount(raw: string): number {
  if (!raw || raw.trim() === '') return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Split a CSV line respecting quoted fields */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

/** Detect which bank format the CSV belongs to, based on header row */
export function detectBankFormat(headers: string[]): BankFormat {
  const h = headers.map((x) => x.trim().toLowerCase());

  // HDFC Savings: Date, Narration, Value Dat, Debit Amount, Credit Amount, Chq/Ref Number, Closing Balance
  if (h.includes('narration') && h.some((x) => x.includes('debit amount')) && h.some((x) => x.includes('credit amount'))) {
    return 'hdfc_savings';
  }

  // HDFC Current is similar but may have "withdrawal" / "deposit"
  if (h.includes('narration') && h.some((x) => x.includes('withdrawal') || x.includes('deposit'))) {
    return 'hdfc_current';
  }

  // ICICI: Transaction Date, Value Date, Description, Ref No./Cheque No., Debit, Credit, Balance
  if (h.some((x) => x.includes('transaction date')) && h.includes('description')) {
    return 'icici_savings';
  }

  // SBI: Txn Date, Value Date, Description, Ref No./Cheque No., Debit, Credit, Balance
  if (h.some((x) => x === 'txn date' || x === 'txn_date')) {
    return 'sbi';
  }

  // Axis: Tran Date, CHQNO, PARTICULARS, DR, CR, BAL
  if (h.some((x) => x === 'particulars') && h.some((x) => x === 'dr' || x === 'cr')) {
    return 'axis';
  }

  // Kotak: Date, Description, Chq/Ref No, Debit, Credit, Balance
  if (h.some((x) => x.includes('chq') || x.includes('ref no')) && h.includes('description')) {
    return 'kotak';
  }

  return 'generic';
}

interface ColumnMap {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance?: number;
  reference?: number;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const c of candidates) {
    const idx = h.findIndex((x) => x.includes(c.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function buildColumnMap(headers: string[], format: BankFormat): ColumnMap {
  switch (format) {
    case 'hdfc_savings':
      return {
        date: findColumnIndex(headers, ['date']),
        description: findColumnIndex(headers, ['narration']),
        debit: findColumnIndex(headers, ['debit amount']),
        credit: findColumnIndex(headers, ['credit amount']),
        balance: findColumnIndex(headers, ['closing balance']),
        reference: findColumnIndex(headers, ['chq', 'ref']),
      };

    case 'hdfc_current':
      return {
        date: findColumnIndex(headers, ['date']),
        description: findColumnIndex(headers, ['narration', 'particulars']),
        debit: findColumnIndex(headers, ['withdrawal', 'debit']),
        credit: findColumnIndex(headers, ['deposit', 'credit']),
        balance: findColumnIndex(headers, ['balance']),
        reference: findColumnIndex(headers, ['chq', 'ref']),
      };

    case 'icici_savings':
      return {
        date: findColumnIndex(headers, ['transaction date']),
        description: findColumnIndex(headers, ['description']),
        debit: findColumnIndex(headers, ['debit']),
        credit: findColumnIndex(headers, ['credit']),
        balance: findColumnIndex(headers, ['balance']),
        reference: findColumnIndex(headers, ['ref no', 'cheque']),
      };

    case 'sbi':
      return {
        date: findColumnIndex(headers, ['txn date', 'date']),
        description: findColumnIndex(headers, ['description']),
        debit: findColumnIndex(headers, ['debit']),
        credit: findColumnIndex(headers, ['credit']),
        balance: findColumnIndex(headers, ['balance']),
        reference: findColumnIndex(headers, ['ref no', 'cheque']),
      };

    case 'axis':
      return {
        date: findColumnIndex(headers, ['tran date', 'date']),
        description: findColumnIndex(headers, ['particulars']),
        debit: findColumnIndex(headers, ['dr']),
        credit: findColumnIndex(headers, ['cr']),
        balance: findColumnIndex(headers, ['bal']),
        reference: findColumnIndex(headers, ['chqno', 'chq']),
      };

    case 'kotak':
      return {
        date: findColumnIndex(headers, ['date']),
        description: findColumnIndex(headers, ['description', 'particulars']),
        debit: findColumnIndex(headers, ['debit']),
        credit: findColumnIndex(headers, ['credit']),
        balance: findColumnIndex(headers, ['balance']),
        reference: findColumnIndex(headers, ['chq', 'ref no']),
      };

    case 'generic':
    default:
      return {
        date: findColumnIndex(headers, ['date', 'txn date', 'transaction date']),
        description: findColumnIndex(headers, ['description', 'narration', 'particulars', 'details']),
        debit: findColumnIndex(headers, ['debit', 'dr', 'withdrawal', 'debit amount']),
        credit: findColumnIndex(headers, ['credit', 'cr', 'deposit', 'credit amount']),
        balance: findColumnIndex(headers, ['balance', 'closing balance', 'bal']),
        reference: findColumnIndex(headers, ['ref', 'chq', 'reference']),
      };
  }
}

/** Parse a bank statement CSV into an array of BankTransaction objects */
export function parseBankStatement(csvContent: string, bankFormat: BankFormat): BankTransaction[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find header row — skip any initial metadata/bank name lines
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = splitCsvLine(lines[i]);
    const lower = cols.map((c) => c.toLowerCase());
    // A header row will contain recognisable field names
    if (
      lower.some((c) => c.includes('date')) &&
      lower.some((c) =>
        c.includes('debit') || c.includes('credit') || c.includes('amount') || c === 'dr' || c === 'cr',
      )
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = splitCsvLine(lines[headerIndex]);
  const resolvedFormat = bankFormat === 'generic' ? detectBankFormat(headers) : bankFormat;
  const colMap = buildColumnMap(headers, resolvedFormat);

  const transactions: BankTransaction[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitCsvLine(line);

    if (cols.length < 3) continue;

    const rawDate = colMap.date >= 0 ? (cols[colMap.date] ?? '') : '';
    if (!rawDate.trim()) continue;

    let isoDate: string;
    try {
      isoDate = parseStatementDate(rawDate);
    } catch {
      continue; // skip non-data rows
    }

    const description = colMap.description >= 0 ? (cols[colMap.description] ?? '') : '';
    const debit = colMap.debit >= 0 ? parseAmount(cols[colMap.debit] ?? '') : 0;
    const credit = colMap.credit >= 0 ? parseAmount(cols[colMap.credit] ?? '') : 0;
    const balance = colMap.balance !== undefined && colMap.balance >= 0
      ? parseAmount(cols[colMap.balance] ?? '')
      : undefined;
    const referenceNumber =
      colMap.reference !== undefined && colMap.reference >= 0
        ? (cols[colMap.reference] ?? '').trim() || undefined
        : undefined;

    transactions.push({
      date: isoDate,
      description: description.trim(),
      debit,
      credit,
      balance,
      referenceNumber,
      rawLine: line,
    });
  }

  return transactions;
}
