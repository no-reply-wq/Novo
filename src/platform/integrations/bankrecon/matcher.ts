/**
 * Bank reconciliation matching engine.
 * Matches bank statement transactions against ledger entries using
 * multiple strategies ordered by confidence.
 */

import type { BankTransaction, LedgerEntry, ReconMatch } from './types';
import { parseStatementDate } from './parsers/csv-parser';

/** Normalize debit/credit pair into a signed amount (debit = negative, credit = positive) */
export function normalizeAmount(debit: number, credit: number): number {
  if (debit > 0) return -debit;
  if (credit > 0) return credit;
  return 0;
}

/** Re-export for convenience */
export { parseStatementDate };

/** Difference in days between two ISO date strings */
function dayDiff(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return Math.abs((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24));
}

/** Normalize a reference number for comparison — strip spaces, leading zeros, etc. */
function normalizeRef(ref: string): string {
  return ref.replace(/\s+/g, '').replace(/^0+/, '').toLowerCase();
}

/** Check whether two reference strings share a meaningful substring overlap */
function referencesMatch(refA: string, refB: string): boolean {
  if (!refA || !refB) return false;
  const a = normalizeRef(refA);
  const b = normalizeRef(refB);
  if (a === b) return true;
  // substring inclusion (at least 6 chars to avoid accidental matches)
  if (a.length >= 6 && b.includes(a)) return true;
  if (b.length >= 6 && a.includes(b)) return true;
  return false;
}

export interface MatchOptions {
  dateTolerance?: number;    // days (default: 2)
  amountTolerance?: number;  // absolute amount difference (default: 0)
  useReferenceMatch?: boolean;
}

/**
 * Match bank transactions against ledger entries.
 * Each bank transaction is matched to at most one ledger entry (greedy, highest confidence first).
 */
export function matchTransactions(params: {
  bankTransactions: BankTransaction[];
  ledgerEntries: LedgerEntry[];
  options?: MatchOptions;
}): ReconMatch[] {
  const { bankTransactions, ledgerEntries, options = {} } = params;
  const dateTolerance = options.dateTolerance ?? 2;
  const amountTolerance = options.amountTolerance ?? 0;
  const useReferenceMatch = options.useReferenceMatch ?? true;

  /** Ledger entries not yet consumed by a match */
  const available = new Set(ledgerEntries.map((e) => e.id));

  interface Candidate {
    bankIdx: number;
    ledgerEntry: LedgerEntry;
    confidence: number;
    matchReason: string;
  }

  // Build all candidate matches and sort by descending confidence
  const candidates: Candidate[] = [];

  for (let bankIdx = 0; bankIdx < bankTransactions.length; bankIdx++) {
    const tx = bankTransactions[bankIdx];
    const txAmount = normalizeAmount(tx.debit, tx.credit);

    for (const entry of ledgerEntries) {
      if (!available.has(entry.id)) continue;

      const amountDiff = Math.abs(Math.abs(txAmount) - Math.abs(entry.amount));
      const amountMatch = amountDiff <= amountTolerance;
      const dateDiff = dayDiff(tx.date, entry.date);
      const sameDate = dateDiff === 0;
      const fuzzyDate = dateDiff <= dateTolerance;
      const refOk = useReferenceMatch && referencesMatch(
        tx.referenceNumber ?? '',
        entry.referenceNumber ?? '',
      );

      // 1. Exact: same amount + same date + reference match
      if (amountMatch && sameDate && refOk) {
        candidates.push({ bankIdx, ledgerEntry: entry, confidence: 1.0, matchReason: 'exact_amount_date' });
        continue;
      }

      // 2. Exact: same amount + same date (no reference)
      if (amountMatch && sameDate) {
        candidates.push({ bankIdx, ledgerEntry: entry, confidence: 0.9, matchReason: 'amount_date_fuzzy' });
        continue;
      }

      // 3. Same amount + date within tolerance
      if (amountMatch && fuzzyDate) {
        candidates.push({ bankIdx, ledgerEntry: entry, confidence: 0.9, matchReason: 'amount_date_fuzzy' });
        continue;
      }

      // 4. Reference match (even if date is slightly off)
      if (refOk && dateDiff <= 7) {
        candidates.push({ bankIdx, ledgerEntry: entry, confidence: 0.85, matchReason: 'reference_match' });
        continue;
      }

      // 5. Amount only within ±3 days
      if (amountMatch && dateDiff <= 3) {
        candidates.push({ bankIdx, ledgerEntry: entry, confidence: 0.6, matchReason: 'amount_date_fuzzy' });
      }
    }
  }

  // Sort by confidence desc, then by date diff asc as a tiebreaker
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return 0;
  });

  // Greedy assignment
  const matchedBankIndices = new Set<number>();
  const assignedLedgerIds = new Set<string>();
  const assignments = new Map<number, Candidate>();

  for (const cand of candidates) {
    if (matchedBankIndices.has(cand.bankIdx)) continue;
    if (assignedLedgerIds.has(cand.ledgerEntry.id)) continue;

    matchedBankIndices.add(cand.bankIdx);
    assignedLedgerIds.add(cand.ledgerEntry.id);
    assignments.set(cand.bankIdx, cand);
  }

  // Build final result array
  const results: ReconMatch[] = bankTransactions.map((tx, idx) => {
    const assignment = assignments.get(idx);
    if (!assignment) {
      return {
        bankTransaction: tx,
        ledgerEntry: null,
        confidence: 0,
        matchReason: 'no_match',
        status: 'unmatched',
      };
    }

    const { ledgerEntry, confidence, matchReason } = assignment;
    const status: ReconMatch['status'] = confidence >= 0.9 ? 'auto_matched' : 'suggested';

    return {
      bankTransaction: tx,
      ledgerEntry,
      confidence,
      matchReason,
      status,
    };
  });

  return results;
}
