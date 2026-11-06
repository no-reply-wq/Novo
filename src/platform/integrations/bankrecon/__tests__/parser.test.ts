import { parseBankStatement, detectBankFormat, parseStatementDate } from '../parsers/csv-parser';
import type { BankFormat } from '../parsers/csv-parser';

// ─── Sample CSVs ──────────────────────────────────────────────────────────────

const HDFC_CSV = `Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
01/01/2024,NEFT Transfer,01/01/2024,5000.00,,REF123456,45000.00
05/01/2024,Salary Credit,05/01/2024,,50000.00,SAL001,95000.00
10/01/2024,ATM Withdrawal,10/01/2024,2000.00,,,93000.00
`;

const ICICI_CSV = `Transaction Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
02/01/2024,02/01/2024,Online Purchase,TXN20240102,1500.00,,83500.00
08/01/2024,08/01/2024,Refund Received,TXN20240108,,3000.00,86500.00
`;

const GENERIC_CSV = `date,description,debit,credit,balance
2024-01-03,Utility Bill,800,,72000
2024-01-07,Insurance Premium,1200,,70800
2024-01-15,Dividend Received,,5000,75800
`;

// ─── parseStatementDate tests ─────────────────────────────────────────────────

describe('parseStatementDate', () => {
  it('parses DD/MM/YYYY format', () => {
    expect(parseStatementDate('01/02/2024')).toBe('2024-02-01');
  });

  it('parses DD-MM-YYYY format', () => {
    expect(parseStatementDate('01-02-2024')).toBe('2024-02-01');
  });

  it('passes through ISO YYYY-MM-DD', () => {
    expect(parseStatementDate('2024-02-01')).toBe('2024-02-01');
  });

  it('parses DD MMM YYYY format', () => {
    expect(parseStatementDate('15 Jan 2024')).toBe('2024-01-15');
  });

  it('pads single-digit day and month', () => {
    expect(parseStatementDate('5/3/2024')).toBe('2024-03-05');
  });

  it('throws for unparseable strings', () => {
    expect(() => parseStatementDate('not-a-date')).toThrow();
  });
});

// ─── detectBankFormat tests ───────────────────────────────────────────────────

describe('detectBankFormat', () => {
  it('detects hdfc_savings from headers', () => {
    const headers = ['Date', 'Narration', 'Value Dat', 'Debit Amount', 'Credit Amount', 'Chq/Ref Number', 'Closing Balance'];
    expect(detectBankFormat(headers)).toBe('hdfc_savings');
  });

  it('detects icici_savings from headers', () => {
    const headers = ['Transaction Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'];
    expect(detectBankFormat(headers)).toBe('icici_savings');
  });

  it('detects sbi from headers', () => {
    const headers = ['Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'];
    expect(detectBankFormat(headers)).toBe('sbi');
  });

  it('detects axis from PARTICULARS/DR/CR headers', () => {
    const headers = ['Tran Date', 'CHQNO', 'PARTICULARS', 'DR', 'CR', 'BAL'];
    expect(detectBankFormat(headers)).toBe('axis');
  });

  it('falls back to generic for unknown headers', () => {
    const headers = ['col1', 'col2', 'col3'];
    expect(detectBankFormat(headers)).toBe('generic');
  });
});

// ─── parseBankStatement — HDFC ────────────────────────────────────────────────

describe('parseBankStatement — hdfc_savings', () => {
  const transactions = parseBankStatement(HDFC_CSV, 'hdfc_savings');

  it('parses 3 transactions', () => {
    expect(transactions).toHaveLength(3);
  });

  it('parses first transaction date correctly', () => {
    expect(transactions[0].date).toBe('2024-01-01');
  });

  it('parses debit amount', () => {
    expect(transactions[0].debit).toBe(5000);
    expect(transactions[0].credit).toBe(0);
  });

  it('parses credit amount', () => {
    expect(transactions[1].credit).toBe(50000);
    expect(transactions[1].debit).toBe(0);
  });

  it('parses reference number', () => {
    expect(transactions[0].referenceNumber).toBe('REF123456');
  });

  it('parses closing balance', () => {
    expect(transactions[0].balance).toBe(45000);
  });

  it('stores rawLine', () => {
    expect(transactions[0].rawLine).toContain('NEFT Transfer');
  });
});

// ─── parseBankStatement — ICICI ───────────────────────────────────────────────

describe('parseBankStatement — icici_savings', () => {
  const transactions = parseBankStatement(ICICI_CSV, 'icici_savings');

  it('parses 2 transactions', () => {
    expect(transactions).toHaveLength(2);
  });

  it('parses date correctly', () => {
    expect(transactions[0].date).toBe('2024-01-02');
  });

  it('parses debit correctly', () => {
    expect(transactions[0].debit).toBe(1500);
    expect(transactions[0].credit).toBe(0);
  });

  it('parses credit correctly', () => {
    expect(transactions[1].credit).toBe(3000);
    expect(transactions[1].debit).toBe(0);
  });
});

// ─── parseBankStatement — generic ────────────────────────────────────────────

describe('parseBankStatement — generic', () => {
  const transactions = parseBankStatement(GENERIC_CSV, 'generic');

  it('auto-detects and parses 3 transactions', () => {
    expect(transactions).toHaveLength(3);
  });

  it('parses ISO date directly', () => {
    expect(transactions[0].date).toBe('2024-01-03');
  });

  it('parses debit in generic format', () => {
    expect(transactions[0].debit).toBe(800);
  });

  it('parses credit in generic format', () => {
    expect(transactions[2].credit).toBe(5000);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('parseBankStatement — edge cases', () => {
  it('returns empty array for empty CSV', () => {
    expect(parseBankStatement('', 'generic')).toHaveLength(0);
  });

  it('returns empty array for header-only CSV', () => {
    const csv = 'Date,Description,Debit,Credit,Balance\n';
    expect(parseBankStatement(csv, 'generic')).toHaveLength(0);
  });

  it('handles amounts with commas (e.g. 1,000.00)', () => {
    const csv = `Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
01/01/2024,Test,"01/01/2024","1,000.00",,,99000
`;
    const txns = parseBankStatement(csv, 'hdfc_savings');
    expect(txns[0].debit).toBe(1000);
  });
});
