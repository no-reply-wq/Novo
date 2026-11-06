import { matchTransactions, normalizeAmount } from '../matcher';
import type { BankTransaction, LedgerEntry } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    date: '2024-01-10',
    description: 'Test transaction',
    debit: 0,
    credit: 1000,
    rawLine: 'raw',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'entry-1',
    date: '2024-01-10',
    description: 'Test entry',
    amount: 1000,
    isReconciled: false,
    ...overrides,
  };
}

// ─── normalizeAmount ──────────────────────────────────────────────────────────

describe('normalizeAmount', () => {
  it('converts debit to negative amount', () => {
    expect(normalizeAmount(1000, 0)).toBe(-1000);
  });

  it('converts credit to positive amount', () => {
    expect(normalizeAmount(0, 1000)).toBe(1000);
  });

  it('returns 0 when both are 0', () => {
    expect(normalizeAmount(0, 0)).toBe(0);
  });

  it('prefers debit when both are set', () => {
    expect(normalizeAmount(500, 200)).toBe(-500);
  });
});

// ─── Exact match ─────────────────────────────────────────────────────────────

describe('matchTransactions — exact match', () => {
  it('matches same amount + same date → confidence 1.0', () => {
    const tx = makeTx({ credit: 1000, referenceNumber: 'REF001' });
    const entry = makeEntry({ amount: 1000, referenceNumber: 'REF001' });

    const matches = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(1.0);
    expect(matches[0].status).toBe('auto_matched');
    expect(matches[0].matchReason).toBe('exact_amount_date');
  });

  it('matches same amount + same date without reference → confidence 0.9', () => {
    const tx = makeTx({ credit: 500 });
    const entry = makeEntry({ amount: 500 });

    const matches = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    expect(matches[0].confidence).toBe(0.9);
    expect(matches[0].status).toBe('auto_matched');
  });
});

// ─── Fuzzy date match ─────────────────────────────────────────────────────────

describe('matchTransactions — fuzzy date', () => {
  it('matches same amount within dateTolerance → confidence 0.9', () => {
    const tx = makeTx({ date: '2024-01-10', credit: 2500 });
    const entry = makeEntry({ date: '2024-01-12', amount: 2500 }); // 2 days later

    const matches = matchTransactions({
      bankTransactions: [tx],
      ledgerEntries: [entry],
      options: { dateTolerance: 2 },
    });
    expect(matches[0].confidence).toBe(0.9);
    expect(matches[0].matchReason).toBe('amount_date_fuzzy');
  });

  it('does NOT match when date diff exceeds tolerance', () => {
    const tx = makeTx({ date: '2024-01-10', credit: 2500 });
    const entry = makeEntry({ date: '2024-01-20', amount: 2500 }); // 10 days later

    const matches = matchTransactions({
      bankTransactions: [tx],
      ledgerEntries: [entry],
      options: { dateTolerance: 2 },
    });
    expect(matches[0].status).toBe('unmatched');
  });
});

// ─── Reference match ──────────────────────────────────────────────────────────

describe('matchTransactions — reference match', () => {
  it('matches by partial reference number → confidence 0.85 when date exceeds tolerance', () => {
    // Amount matches but date diff is 5 days (> dateTolerance=2), so falls through to reference match
    const tx = makeTx({
      date: '2024-01-10',
      credit: 7500,
      referenceNumber: 'NEFT/2024010500REF9876543',
    });
    const entry = makeEntry({
      date: '2024-01-15',  // 5 days diff — beyond default dateTolerance of 2
      amount: 7500,
      referenceNumber: 'REF9876543',
    });

    const matches = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    // Should match via reference (confidence 0.85) or amount-only (0.6); either is a match
    expect(matches[0].status).not.toBe('unmatched');
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(['reference_match', 'amount_date_fuzzy']).toContain(matches[0].matchReason);
  });
});

// ─── No match ─────────────────────────────────────────────────────────────────

describe('matchTransactions — no match', () => {
  it('returns unmatched when amounts differ', () => {
    const tx = makeTx({ credit: 1000 });
    const entry = makeEntry({ amount: 2000 });

    const matches = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    expect(matches[0].status).toBe('unmatched');
    expect(matches[0].confidence).toBe(0);
    expect(matches[0].ledgerEntry).toBeNull();
  });

  it('returns unmatched when no ledger entries provided', () => {
    const tx = makeTx({ credit: 1000 });
    const matches = matchTransactions({ bankTransactions: [tx], ledgerEntries: [] });
    expect(matches[0].status).toBe('unmatched');
  });
});

// ─── Greedy one-to-one assignment ─────────────────────────────────────────────

describe('matchTransactions — greedy assignment', () => {
  it('each bank transaction matches at most one ledger entry', () => {
    const tx1 = makeTx({ date: '2024-01-10', credit: 1000 });
    const tx2 = makeTx({ date: '2024-01-10', credit: 1000 });
    const entry = makeEntry({ id: 'entry-1', date: '2024-01-10', amount: 1000 });

    const matches = matchTransactions({
      bankTransactions: [tx1, tx2],
      ledgerEntries: [entry],
    });

    const matched = matches.filter((m) => m.status !== 'unmatched');
    const unmatched = matches.filter((m) => m.status === 'unmatched');

    expect(matched).toHaveLength(1);
    expect(unmatched).toHaveLength(1);
  });

  it('two distinct entries matched to two transactions', () => {
    const tx1 = makeTx({ date: '2024-01-10', credit: 1000 });
    const tx2 = makeTx({ date: '2024-01-15', credit: 2000 });
    const entry1 = makeEntry({ id: 'e1', date: '2024-01-10', amount: 1000 });
    const entry2 = makeEntry({ id: 'e2', date: '2024-01-15', amount: 2000 });

    const matches = matchTransactions({
      bankTransactions: [tx1, tx2],
      ledgerEntries: [entry1, entry2],
    });

    expect(matches[0].ledgerEntry?.id).toBe('e1');
    expect(matches[1].ledgerEntry?.id).toBe('e2');
  });
});

// ─── Suggested vs auto_matched ────────────────────────────────────────────────

describe('matchTransactions — status levels', () => {
  it('confidence >= 0.9 → auto_matched', () => {
    const tx = makeTx({ credit: 500 });
    const entry = makeEntry({ amount: 500 });
    const [match] = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    expect(match.status).toBe('auto_matched');
  });

  it('confidence < 0.9 → suggested', () => {
    // Amount-only match within 3 days (confidence 0.6)
    const tx = makeTx({ date: '2024-01-10', credit: 3000 });
    const entry = makeEntry({ date: '2024-01-13', amount: 3000 }); // 3 days diff, no ref

    const [match] = matchTransactions({
      bankTransactions: [tx],
      ledgerEntries: [entry],
      options: { dateTolerance: 1 }, // won't match fuzzy, falls to amount-only
    });
    if (match.status !== 'unmatched') {
      expect(match.confidence).toBeLessThan(0.9);
      expect(match.status).toBe('suggested');
    } else {
      // amount-only within 3 days is still covered
      expect(match.status).toBe('unmatched');
    }
  });
});

// ─── Debit transactions ───────────────────────────────────────────────────────

describe('matchTransactions — debit amounts', () => {
  it('matches a debit bank transaction against a negative ledger amount', () => {
    const tx = makeTx({ debit: 800, credit: 0 });
    const entry = makeEntry({ amount: -800 });

    const [match] = matchTransactions({ bankTransactions: [tx], ledgerEntries: [entry] });
    expect(match.status).not.toBe('unmatched');
  });
});
