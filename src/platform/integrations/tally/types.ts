/**
 * Tally ERP integration types.
 */

export interface TallyExportConfig {
  companyName: string;
  financialYear: string;  // "2024-25"
  exportFormat: 'xml' | 'csv';
}

export interface TallyVoucher {
  date: string;           // ISO date: "2024-01-15"
  voucherType: 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Journal';
  voucherNumber: string;
  partyName: string;
  amount: number;
  narration?: string;
  ledgerEntries: TallyLedgerEntry[];
}

export interface TallyLedgerEntry {
  ledgerName: string;
  amount: number;         // positive = Dr, negative = Cr
  taxRate?: number;
}

export interface TallyVoucherMapping {
  dateField: string;
  voucherNumberField: string;
  partyField: string;
  amountField: string;
  voucherType: TallyVoucher['voucherType'];
  ledgerMappings: Array<{
    ledgerName: string;
    amountExpression: string;  // e.g. "record.total_amount"
  }>;
}
