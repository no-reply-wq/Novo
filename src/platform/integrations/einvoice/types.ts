/**
 * E-Invoice (IRP) integration types.
 *
 * India's Invoice Registration Portal (IRP) requires invoices above ₹5 crore
 * turnover to be registered. The IRP returns an IRN (Invoice Reference Number),
 * signed QR code, and acknowledgement details.
 */

export interface EInvoiceConfig {
  gstin: string;
  username: string; // IRP portal username
  password: string; // encrypted via encryptSecret
  sandbox: boolean;
  clientId: string;
  clientSecret: string;
}

export interface EInvoiceItem {
  slNo: string;
  prdDesc: string;
  isServc: 'Y' | 'N';
  hsnCd: string;
  qty?: number;
  unit?: string;
  unitPrice: number;
  totAmt: number;
  discount?: number;
  assAmt: number;
  gstRt: number;
  igstAmt?: number;
  cgstAmt?: number;
  sgstAmt?: number;
  totItemVal: number;
}

export interface EInvoicePayload {
  version: string; // "1.1"
  tranDtls: {
    taxSch: 'GST';
    supTyp: 'B2B' | 'B2C' | 'EXPWP' | 'EXPWOP' | 'DEXP';
    regRev: 'Y' | 'N';
  };
  docDtls: {
    typ: 'INV' | 'CRN' | 'DBN';
    no: string; // invoice number
    dt: string; // DD/MM/YYYY
  };
  sellerDtls: {
    gstin: string;
    lglNm: string;
    addr1: string;
    loc: string;
    pin: number;
    stcd: string; // state code
  };
  buyerDtls: {
    gstin: string;
    lglNm: string;
    pos: string; // place of supply state code
    addr1: string;
    loc: string;
    pin: number;
    stcd: string;
  };
  itemList: EInvoiceItem[];
  valDtls: {
    assVal: number;
    cgstVal: number;
    sgstVal: number;
    igstVal: number;
    totInvVal: number;
  };
}

export interface EInvoiceResponse {
  irn: string;
  ackNo: string;
  ackDt: string; // "YYYY-MM-DD HH:mm:ss"
  signedQrCode: string;
  signedInvoice: string;
  status: 'ACT' | 'CNL';
}

export interface EInvoiceFieldMapping {
  // Maps invoice table fields to IRP payload fields
  invoiceNumber: string;
  invoiceDate: string;
  buyerGstin: string;
  buyerName: string;
  buyerAddress: string;
  buyerCity: string;
  buyerPincode: string;
  buyerStateCode: string;
  itemsTableId: string; // related table ID for line items
  itemDescription: string;
  itemHsn: string;
  itemQty: string;
  itemUnit: string;
  itemRate: string;
  itemTaxableAmount: string;
  itemGstRate: string;
  totalTaxableAmount: string;
  totalGst: string;
  totalInvoiceAmount: string;
}

/** Stored in platform.einvoice_records */
export interface EInvoiceRecord {
  id: string;
  tenantSlug: string;
  recordId: string;
  tableId: string;
  irn: string | null;
  ackNo: string | null;
  ackDt: string | null;
  signedQr: string | null;
  status: 'pending' | 'generated' | 'cancelled' | 'error';
  errorMessage: string | null;
  generatedAt: string | null;
  createdAt: string;
}
