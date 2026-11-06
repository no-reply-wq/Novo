/**
 * TDS Configuration Types
 * Defines how the TDS integration is configured per tenant/app.
 */

export interface TDSConfig {
  deductorGSTIN: string;
  deductorPAN: string;
  deductorName: string;
  deductorType: 'company' | 'individual' | 'government';
  financialYear: string;         // e.g. "2024-25"

  // Field mappings for vendor/payment tables
  vendorTableId: string;
  vendorFieldMapping: {
    name: string;                // field holding vendor name
    pan: string;                 // field holding vendor PAN
    vendorType: string;          // individual/company field
    tdsSection: string;          // which section to apply
    tdsExempt: string;           // boolean field: exempt from TDS
  };

  paymentTableId: string;
  paymentFieldMapping: {
    vendorId: string;            // relation to vendor table
    amount: string;              // payment amount field
    date: string;                // payment date field
    tdsAmount: string;           // field to write TDS amount into
    tdsSection: string;          // field to write section into
    netAmount: string;           // field to write net payable into
  };
}

/** Stored row shape in platform.tds_configs */
export interface TDSConfigRow {
  id: string;
  tenant_slug: string;
  app_id: string;
  config: TDSConfig;
  created_at: string;
}

/** Stored row shape in platform.tds_records */
export interface TDSRecordRow {
  id: string;
  tenant_slug: string;
  payment_record_id: string;
  vendor_id: string;
  vendor_name: string | null;
  vendor_pan: string | null;
  section: string;
  gross_amount: string;          // numeric from pg comes as string
  tds_rate: string;
  tds_amount: string;
  net_amount: string;
  financial_year: string;
  quarter: number | null;
  payment_date: string | null;
  created_at: string;
}
