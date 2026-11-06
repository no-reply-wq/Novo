/**
 * GST R1 Aggregation Engine
 * Classifies invoices into B2B, B2CL, B2CS, CDNR, HSN and Document Summary sections.
 */

import type {
  GSTR1Config,
  GSTR1Return,
  B2BInvoice,
  B2CLInvoice,
  B2CSummary,
  CDNREntry,
  HSNSummary,
  DocumentSummary,
} from './types';

/** Format date to DD-MM-YYYY from various input formats (ISO, DD/MM/YYYY, etc.) */
export function formatGSTDate(date: string): string {
  // ISO format: 2024-01-15 → 15-01-2024
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  // DD/MM/YYYY → DD-MM-YYYY
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(date);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
  }
  // Already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}/.test(date)) {
    return date;
  }
  return date;
}

/** Determine supply type based on seller and buyer state codes */
export function getSupplyType(sellerState: string, buyerState: string): 'INTER' | 'INTRA' {
  return sellerState === buyerState ? 'INTRA' : 'INTER';
}

/** Validate GSTIN format: 15 chars, state code (2 digits) + PAN (10) + entity (1) + Z + checksum */
export function isValidGSTIN(gstin: string): boolean {
  if (!gstin || gstin.length !== 15) return false;
  const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return pattern.test(gstin);
}

/** Parse a date string and return month (1-12) and year */
function parseDatePeriod(dateStr: string): { month: number; year: number } | null {
  // ISO: 2024-01-15
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1], 10), month: parseInt(isoMatch[2], 10) };
  }
  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{2})[-\/](\d{2})[-\/](\d{4})/.exec(dateStr);
  if (dmyMatch) {
    return { year: parseInt(dmyMatch[3], 10), month: parseInt(dmyMatch[2], 10) };
  }
  return null;
}

/** Safely read a string field from an invoice record */
function str(row: Record<string, unknown>, field: string): string {
  const val = row[field];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/** Safely read a numeric field from an invoice record */
function num(row: Record<string, unknown>, field: string): number {
  const val = row[field];
  if (val === null || val === undefined) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

/** Compute GST rate from amounts */
function computeGSTRate(taxableValue: number, igst: number, cgst: number, sgst: number): number {
  const totalTax = igst || (cgst + sgst);
  if (taxableValue === 0) return 0;
  return Math.round((totalTax / taxableValue) * 100);
}

export function aggregateGSTR1(params: {
  invoices: Record<string, unknown>[]
  config: GSTR1Config
  period: { month: number; year: number }
  sellerStateCode: string
}): GSTR1Return {
  const { invoices, config, period, sellerStateCode } = params;
  const fm = config.fieldMapping;

  const fp = `${String(period.month).padStart(2, '0')}${period.year}`;

  // Filter to the requested period
  const periodInvoices = invoices.filter((inv) => {
    const dateStr = str(inv, fm.invoiceDate);
    const parsed = parseDatePeriod(dateStr);
    if (!parsed) return false;
    return parsed.month === period.month && parsed.year === period.year;
  });

  // ─── B2B grouping by buyer GSTIN ───────────────────────────────────────────
  const b2bMap = new Map<string, B2BInvoice>();

  // ─── B2CL grouping by place of supply ──────────────────────────────────────
  const b2clMap = new Map<string, B2CLInvoice>();

  // ─── B2CS grouping by state+rate key ───────────────────────────────────────
  const b2csMap = new Map<string, B2CSummary>();

  // ─── CDNR grouping by buyer GSTIN ──────────────────────────────────────────
  const cdnrMap = new Map<string, CDNREntry>();

  // ─── HSN grouping by HSN code ───────────────────────────────────────────────
  const hsnMap = new Map<string, HSNSummary>();

  // Document counts
  let invoiceCount = 0;
  let cancelCount = 0;

  periodInvoices.forEach((inv) => {
    const invoiceType = str(inv, fm.invoiceType).toUpperCase();
    const isCreditNote = invoiceType === 'CREDIT NOTE' || invoiceType === 'CN' || invoiceType === 'CDNR';
    const isDebitNote = invoiceType === 'DEBIT NOTE' || invoiceType === 'DN';
    const isCancelled = invoiceType === 'CANCELLED' || invoiceType === 'CANCEL';

    if (isCancelled) {
      cancelCount++;
      return;
    }

    invoiceCount++;

    const buyerGstin = str(inv, fm.buyerGstin).toUpperCase();
    const buyerState = str(inv, fm.buyerStateCode);
    const pos = str(inv, fm.placeOfSupply) || buyerState;
    const invoiceNum = str(inv, fm.invoiceNumber);
    const invoiceDateRaw = str(inv, fm.invoiceDate);
    const invoiceDate = formatGSTDate(invoiceDateRaw);
    const rchrg = str(inv, fm.reverseCharge).toUpperCase() === 'Y' ? 'Y' as const : 'N' as const;
    const invoiceVal = num(inv, fm.invoiceValue);
    const taxableVal = num(inv, fm.taxableValue);
    const igst = num(inv, fm.igstAmount);
    const cgst = num(inv, fm.cgstAmount);
    const sgst = num(inv, fm.sgstAmount);
    const cess = num(inv, fm.cessAmount);
    const hsn = str(inv, fm.hsnCode);
    const itemDesc = str(inv, fm.itemDescription);
    const gstRate = computeGSTRate(taxableVal, igst, cgst, sgst);
    const supplyType = getSupplyType(sellerStateCode, pos);

    const itm_det_base = {
      rt: gstRate,
      txval: taxableVal,
      ...(igst > 0 ? { iamt: igst } : {}),
      ...(cgst > 0 ? { camt: cgst } : {}),
      ...(sgst > 0 ? { samt: sgst } : {}),
      ...(cess > 0 ? { csamt: cess } : {}),
    };

    // ── CDNR ──────────────────────────────────────────────────────────────────
    if ((isCreditNote || isDebitNote) && isValidGSTIN(buyerGstin)) {
      const existing = cdnrMap.get(buyerGstin) ?? { ctin: buyerGstin, nt: [] };
      existing.nt.push({
        ntty: isCreditNote ? 'C' : 'D',
        nt_num: invoiceNum,
        nt_dt: invoiceDate,
        val: invoiceVal,
        pos,
        rchrg,
        itms: [{ num: 1, itm_det: itm_det_base }],
      });
      cdnrMap.set(buyerGstin, existing);
    } else if (isValidGSTIN(buyerGstin)) {
      // ── B2B ─────────────────────────────────────────────────────────────────
      const existing = b2bMap.get(buyerGstin) ?? { ctin: buyerGstin, inv: [] };
      existing.inv.push({
        inum: invoiceNum,
        idt: invoiceDate,
        val: invoiceVal,
        pos,
        rchrg,
        itms: [{ num: 1, itm_det: itm_det_base }],
      });
      b2bMap.set(buyerGstin, existing);
    } else if (supplyType === 'INTER' && invoiceVal > 250000) {
      // ── B2C Large: inter-state + value > 2.5 lakh ───────────────────────────
      const existing = b2clMap.get(pos) ?? { pos, inv: [] };
      existing.inv.push({
        inum: invoiceNum,
        idt: invoiceDate,
        val: invoiceVal,
        itms: [{
          num: 1,
          itm_det: {
            rt: gstRate,
            txval: taxableVal,
            iamt: igst,
            ...(cess > 0 ? { csamt: cess } : {}),
          },
        }],
      });
      b2clMap.set(pos, existing);
    } else {
      // ── B2C Small ───────────────────────────────────────────────────────────
      const b2csKey = `${pos}__${gstRate}__${supplyType}`;
      const existing = b2csMap.get(b2csKey) ?? {
        sply_ty: supplyType,
        rt: gstRate,
        pos,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      };
      existing.txval += taxableVal;
      if (igst > 0) existing.iamt = (existing.iamt ?? 0) + igst;
      if (cgst > 0) existing.camt = (existing.camt ?? 0) + cgst;
      if (sgst > 0) existing.samt = (existing.samt ?? 0) + sgst;
      if (cess > 0) existing.csamt = (existing.csamt ?? 0) + cess;
      b2csMap.set(b2csKey, existing);
    }

    // ── HSN Summary (all non-cancelled invoices) ───────────────────────────────
    if (hsn) {
      const hsnEntry = hsnMap.get(hsn) ?? {
        num: hsnMap.size + 1,
        hsn_sc: hsn,
        desc: itemDesc,
        uqc: 'NOS',
        qty: 0,
        val: 0,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      };
      hsnEntry.qty += 1;
      hsnEntry.val += invoiceVal;
      hsnEntry.txval += taxableVal;
      hsnEntry.iamt += igst;
      hsnEntry.camt += cgst;
      hsnEntry.samt += sgst;
      hsnEntry.csamt += cess;
      hsnMap.set(hsn, hsnEntry);
    }
  });

  // Renumber HSN entries
  let hsnNum = 1;
  for (const entry of hsnMap.values()) {
    entry.num = hsnNum++;
  }

  // Document Summary: type 1 = Tax Invoice
  const docIssued: DocumentSummary[] = [
    {
      doc_num: 1,
      docs: [{
        num: 1,
        from: '1',
        to: String(invoiceCount + cancelCount),
        totnum: invoiceCount + cancelCount,
        cancel: cancelCount,
        net_issue: invoiceCount,
      }],
    },
  ];

  return {
    gstin: config.gstin,
    fp,
    b2b: Array.from(b2bMap.values()),
    b2cl: Array.from(b2clMap.values()),
    b2cs: Array.from(b2csMap.values()),
    cdnr: Array.from(cdnrMap.values()),
    hsn: Array.from(hsnMap.values()),
    docIssued,
  };
}
