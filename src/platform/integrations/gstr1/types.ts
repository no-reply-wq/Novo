/**
 * GST R1 filing types — GSTN-compliant structure for monthly outward supply return.
 */

export interface GSTR1Config {
  gstin: string
  legalName: string
  // Field mappings for invoice table
  invoiceTableId: string
  fieldMapping: GSTR1FieldMapping
}

export interface GSTR1FieldMapping {
  invoiceNumber: string
  invoiceDate: string
  invoiceType: string       // field that tells B2B/B2C/export
  buyerGstin: string        // null for B2C
  buyerName: string
  buyerStateCode: string
  placeOfSupply: string
  reverseCharge: string     // Y/N field
  invoiceValue: string      // total invoice amount
  taxableValue: string
  igstAmount: string
  cgstAmount: string
  sgstAmount: string
  cessAmount: string
  hsnCode: string
  itemDescription: string
}

export interface GSTR1Return {
  gstin: string
  fp: string               // filing period MMYYYY e.g. "012024"
  b2b: B2BInvoice[]
  b2cl: B2CLInvoice[]      // B2C large
  b2cs: B2CSummary[]       // B2C small (grouped by state+rate)
  cdnr: CDNREntry[]
  hsn: HSNSummary[]
  docIssued: DocumentSummary[]
}

export interface B2BInvoice {
  ctin: string             // buyer GSTIN
  inv: Array<{
    inum: string           // invoice number
    idt: string            // DD-MM-YYYY
    val: number            // invoice value
    pos: string            // place of supply state code
    rchrg: 'Y' | 'N'
    itms: Array<{
      num: number
      itm_det: {
        rt: number         // GST rate
        txval: number      // taxable value
        iamt?: number      // IGST
        camt?: number      // CGST
        samt?: number      // SGST
        csamt?: number     // CESS
      }
    }>
  }>
}

export interface B2CLInvoice {
  pos: string              // place of supply
  inv: Array<{
    inum: string
    idt: string
    val: number
    itms: Array<{ num: number; itm_det: { rt: number; txval: number; iamt: number; csamt?: number } }>
  }>
}

export interface B2CSummary {
  sply_ty: 'INTER' | 'INTRA'
  rt: number               // GST rate
  pos: string              // state code
  txval: number
  iamt?: number
  camt?: number
  samt?: number
  csamt?: number
}

export interface HSNSummary {
  num: number
  hsn_sc: string
  desc: string
  uqc: string              // unit
  qty: number
  val: number
  txval: number
  iamt: number
  camt: number
  samt: number
  csamt: number
}

export interface CDNREntry {
  ctin: string
  nt: Array<{
    ntty: 'C' | 'D'        // Credit/Debit
    nt_num: string
    nt_dt: string
    val: number
    pos: string
    rchrg: 'Y' | 'N'
    itms: Array<{ num: number; itm_det: { rt: number; txval: number; iamt?: number; camt?: number; samt?: number } }>
  }>
}

export interface DocumentSummary {
  doc_num: number
  docs: Array<{
    num: number
    from: string
    to: string
    totnum: number
    cancel: number
    net_issue: number
  }>
}
