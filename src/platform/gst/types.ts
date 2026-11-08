/**
 * GST Types — GSTR-1 & GSTR-3B
 */

export interface GstrEntry {
  invoiceNumber: string;
  invoiceDate: string;
  customerGstin?: string;
  customerName: string;
  placeOfSupply: string;  // state code e.g. '27'
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess?: number;
  invoiceType: 'B2B' | 'B2C' | 'export';
}

export interface Gstr1Report {
  gstin: string;
  period: string;  // 'MM-YYYY'
  b2b: GstrEntry[];
  b2c: GstrEntry[];
  exports: GstrEntry[];
  totalTaxableValue: number;
  totalTax: number;
}

export interface Gstr3bSummary {
  period: string;
  outwardTaxableSupplies: number;
  outwardTaxAmount: number;
  inwardITCClaimed: number;
  netTaxPayable: number;
}
