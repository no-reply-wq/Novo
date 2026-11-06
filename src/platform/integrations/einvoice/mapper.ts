/**
 * Maps a Novo table record + related line items to the IRP EInvoicePayload format.
 *
 * Date formatting: ISO (YYYY-MM-DD) → DD/MM/YYYY as required by IRP.
 * GST computation: determines inter-state (IGST) vs intra-state (CGST+SGST) based on
 * seller vs buyer state codes. If mapped fields are absent, computes totals from items.
 */

import type { EInvoiceFieldMapping, EInvoiceItem, EInvoicePayload } from './types';

function formatDate(raw: unknown): string {
  const str = String(raw ?? '');
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  // ISO: YYYY-MM-DD (may include time)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return str;
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val ?? '0').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function toString(val: unknown): string {
  return String(val ?? '');
}

function slNo(index: number): string {
  return String(index + 1);
}

export function mapRecordToPayload(params: {
  invoiceRecord: Record<string, unknown>;
  lineItems: Record<string, unknown>[];
  mapping: EInvoiceFieldMapping;
  sellerGstin: string;
  sellerName: string;
  sellerAddress: string;
  sellerCity: string;
  sellerPincode: string;
  sellerStateCode: string;
}): EInvoicePayload {
  const {
    invoiceRecord: rec,
    lineItems,
    mapping,
    sellerGstin,
    sellerName,
    sellerAddress,
    sellerCity,
    sellerPincode,
    sellerStateCode,
  } = params;

  const buyerGstin = toString(rec[mapping.buyerGstin]);
  const buyerStateCode = toString(rec[mapping.buyerStateCode]);
  const isInterState = sellerStateCode !== buyerStateCode;

  // Build item list
  const itemList: EInvoiceItem[] = lineItems.map((item, idx) => {
    const assAmt = toNumber(item[mapping.itemTaxableAmount]);
    const gstRt = toNumber(item[mapping.itemGstRate]);
    const gstAmount = Math.round((assAmt * gstRt) / 100 * 100) / 100;

    const igstAmt = isInterState ? gstAmount : 0;
    const cgstAmt = isInterState ? 0 : Math.round(gstAmount / 2 * 100) / 100;
    const sgstAmt = isInterState ? 0 : Math.round(gstAmount / 2 * 100) / 100;
    const totItemVal = assAmt + igstAmt + cgstAmt + sgstAmt;

    return {
      slNo: slNo(idx),
      prdDesc: toString(item[mapping.itemDescription]),
      isServc: 'N',
      hsnCd: toString(item[mapping.itemHsn]),
      qty: item[mapping.itemQty] !== undefined ? toNumber(item[mapping.itemQty]) : undefined,
      unit: item[mapping.itemUnit] !== undefined ? toString(item[mapping.itemUnit]) : undefined,
      unitPrice: toNumber(item[mapping.itemRate]),
      totAmt: toNumber(item[mapping.itemRate]) * (item[mapping.itemQty] !== undefined ? toNumber(item[mapping.itemQty]) : 1),
      assAmt,
      gstRt,
      igstAmt: isInterState ? igstAmt : undefined,
      cgstAmt: isInterState ? undefined : cgstAmt,
      sgstAmt: isInterState ? undefined : sgstAmt,
      totItemVal,
    };
  });

  // Compute value totals from items if not mapped
  let assVal: number;
  let cgstVal: number;
  let sgstVal: number;
  let igstVal: number;
  let totInvVal: number;

  if (rec[mapping.totalTaxableAmount] !== undefined) {
    assVal = toNumber(rec[mapping.totalTaxableAmount]);
  } else {
    assVal = itemList.reduce((sum, item) => sum + item.assAmt, 0);
  }

  if (isInterState) {
    igstVal = itemList.reduce((sum, item) => sum + (item.igstAmt ?? 0), 0);
    cgstVal = 0;
    sgstVal = 0;
  } else {
    cgstVal = itemList.reduce((sum, item) => sum + (item.cgstAmt ?? 0), 0);
    sgstVal = itemList.reduce((sum, item) => sum + (item.sgstAmt ?? 0), 0);
    igstVal = 0;
  }

  if (rec[mapping.totalInvoiceAmount] !== undefined) {
    totInvVal = toNumber(rec[mapping.totalInvoiceAmount]);
  } else {
    totInvVal = assVal + cgstVal + sgstVal + igstVal;
  }

  return {
    version: '1.1',
    tranDtls: {
      taxSch: 'GST',
      supTyp: 'B2B',
      regRev: 'N',
    },
    docDtls: {
      typ: 'INV',
      no: toString(rec[mapping.invoiceNumber]),
      dt: formatDate(rec[mapping.invoiceDate]),
    },
    sellerDtls: {
      gstin: sellerGstin,
      lglNm: sellerName,
      addr1: sellerAddress,
      loc: sellerCity,
      pin: parseInt(sellerPincode, 10),
      stcd: sellerStateCode,
    },
    buyerDtls: {
      gstin: buyerGstin,
      lglNm: toString(rec[mapping.buyerName]),
      pos: buyerStateCode,
      addr1: toString(rec[mapping.buyerAddress]),
      loc: toString(rec[mapping.buyerCity]),
      pin: parseInt(toString(rec[mapping.buyerPincode]), 10),
      stcd: buyerStateCode,
    },
    itemList,
    valDtls: {
      assVal,
      cgstVal,
      sgstVal,
      igstVal,
      totInvVal,
    },
  };
}
