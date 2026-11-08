/**
 * Tests for bank reconciliation — CSV parsing and matching
 */

import { parseBankStatementCsv, reconcileStatements } from '@/platform/finance/bank-recon';
import type { BankStatement } from '@/platform/finance/bank-recon';
import type { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────
// CSV parsing
// ─────────────────────────────────────────────────────────────

describe('parseBankStatementCsv', () => {
  it('parses generic CSV format', async () => {
    const csv = `Date,Description,Debit,Credit,Balance\n2024-01-10,Payment received,,5000,105000\n2024-01-11,Rent paid,20000,,85000`;
    const result = await parseBankStatementCsv(Buffer.from(csv));
    expect(result).toHaveLength(2);
    expect(result[0].credit).toBe(5000);
    expect(result[0].debit).toBeUndefined();
    expect(result[1].debit).toBe(20000);
    expect(result[1].credit).toBeUndefined();
  });

  it('parses HDFC-style CSV', async () => {
    const csv = `Date,Narration,Chq./Ref.No.,Value Date,Withdrawal Amt.,Deposit Amt.,Closing Balance\n10/01/2024,NEFT Transfer,REF123,10/01/2024,10000,,90000`;
    const result = await parseBankStatementCsv(Buffer.from(csv));
    expect(result).toHaveLength(1);
    expect(result[0].debit).toBe(10000);
    expect(result[0].reference).toBe('REF123');
  });

  it('normalizes date to YYYY-MM-DD', async () => {
    const csv = `Date,Description,Debit,Credit,Balance\n15/03/2024,Test,1000,,9000`;
    const result = await parseBankStatementCsv(Buffer.from(csv));
    expect(result[0].date).toBe('2024-03-15');
  });

  it('returns empty array for empty CSV', async () => {
    const result = await parseBankStatementCsv(Buffer.from(''));
    expect(result).toHaveLength(0);
  });

  it('skips rows without a date', async () => {
    const csv = `Date,Description,Debit,Credit,Balance\n,Opening Balance,,,100000\n2024-01-10,Payment,5000,,95000`;
    const result = await parseBankStatementCsv(Buffer.from(csv));
    expect(result).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Reconciliation matching
// ─────────────────────────────────────────────────────────────

function makeLedgerPool(ledgerRows: Record<string, unknown>[]): Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows: ledgerRows }),
  } as unknown as Pool;
}

const bankEntry: BankStatement = {
  date: '2024-01-10',
  description: 'Payment from client',
  credit: 5000,
  balance: 105000,
};

describe('reconcileStatements - exact match', () => {
  it('matches by amount on same date', async () => {
    const ledger = [{ _id: 'L1', _date: '2024-01-10', _amount: 5000, _ref: '' }];
    const matches = await reconcileStatements([bankEntry], 'app1', 'tenant1', 'ledger', makeLedgerPool(ledger));
    expect(matches[0].status).toBe('matched');
    expect(matches[0].ledgerEntryId).toBe('L1');
  });

  it('matches by reference number', async () => {
    const entry = { ...bankEntry, reference: 'REF999' };
    const ledger = [{ _id: 'L2', _date: '2024-01-12', _amount: 5000, _ref: 'REF999' }];
    const matches = await reconcileStatements([entry], 'app1', 'tenant1', 'ledger', makeLedgerPool(ledger));
    expect(matches[0].status).toBe('matched');
    expect(matches[0].ledgerEntryId).toBe('L2');
  });

  it('matches within ±3 day proximity', async () => {
    const ledger = [{ _id: 'L3', _date: '2024-01-12', _amount: 5000, _ref: '' }];
    const matches = await reconcileStatements([bankEntry], 'app1', 'tenant1', 'ledger', makeLedgerPool(ledger));
    expect(matches[0].status).toBe('matched');
  });
});

describe('reconcileStatements - partial match', () => {
  it('flags as partial when amounts differ by less than 5%', async () => {
    const ledger = [{ _id: 'L4', _date: '2024-01-10', _amount: 4850, _ref: '' }];
    const matches = await reconcileStatements([bankEntry], 'app1', 'tenant1', 'ledger', makeLedgerPool(ledger));
    expect(matches[0].status).toBe('partial');
    expect(matches[0].difference).toBeCloseTo(150, 0);
  });
});

describe('reconcileStatements - unmatched', () => {
  it('marks as unmatched when no ledger entry found', async () => {
    const matches = await reconcileStatements([bankEntry], 'app1', 'tenant1', 'ledger', makeLedgerPool([]));
    expect(matches[0].status).toBe('unmatched');
    expect(matches[0].ledgerEntryId).toBeUndefined();
  });

  it('returns empty array for empty bank statements', async () => {
    const matches = await reconcileStatements([], 'app1', 'tenant1', 'ledger', makeLedgerPool([]));
    expect(matches).toHaveLength(0);
  });
});
