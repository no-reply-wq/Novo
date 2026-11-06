/**
 * Bank Reconciliation integration types.
 */

export interface BankReconConfig {
  /** Which Novo table holds ledger/payment entries */
  ledgerTableId: string;
  fieldMapping: LedgerFieldMapping;
  bankName?: string;
}

export interface LedgerFieldMapping {
  date: string;             // field name in ledger table
  amount: string;           // positive = credit, negative = debit (or use separate fields)
  debitAmount?: string;     // optional separate debit field
  creditAmount?: string;    // optional separate credit field
  description: string;
  referenceNumber?: string;
  reconStatus?: string;     // field to mark as reconciled
  bankTransactionId?: string;
}

export interface BankTransaction {
  date: string;             // ISO date
  description: string;
  debit: number;            // 0 if credit
  credit: number;           // 0 if debit
  balance?: number;
  referenceNumber?: string;
  rawLine: string;          // original CSV line for debugging
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;           // positive = credit, negative = debit
  referenceNumber?: string;
  isReconciled: boolean;
}

export interface ReconMatch {
  bankTransaction: BankTransaction;
  ledgerEntry: LedgerEntry | null;
  confidence: number;       // 0-1
  matchReason: string;      // "exact_amount_date" | "amount_date_fuzzy" | "reference_match"
  status: 'auto_matched' | 'suggested' | 'unmatched';
}

export interface ReconSession {
  id: string;
  tenantSlug: string;
  uploadedAt: string;
  bankName: string;
  statementPeriod: { from: string; to: string };
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  matches: ReconMatch[];
}
