/**
 * Maps a database record + line items to an EWayBillPayload using field mapping config.
 */

import type { EWayBillConfig, EWayBillFieldMapping, EWayBillItem, EWayBillPayload } from './types';
import { getStateCode } from './state-codes';

function getString(record: Record<string, unknown>, field: string): string {
  const val = record[field];
  if (val === null || val === undefined) return '';
  return String(val);
}

function getNumber(record: Record<string, unknown>, field: string): number {
  const val = record[field];
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Convert ISO date (YYYY-MM-DD) or any parseable date to DD/MM/YYYY.
 */
export function formatDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  // Already in DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Resolve a state code from either a numeric value or a state name string.
 */
function resolveStateCode(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!isNaN(n) && n > 0) return n;
    return getStateCode(value);
  }
  return 0;
}

export function mapRecordToEWBPayload(params: {
  record: Record<string, unknown>;
  lineItems: Record<string, unknown>[];
  mapping: EWayBillFieldMapping;
  config: EWayBillConfig;
}): EWayBillPayload {
  const { record, lineItems, mapping, config } = params;

  const docNo = getString(record, mapping.documentNumber);
  const docDateRaw = getString(record, mapping.documentDate);
  const docDate = formatDateToDDMMYYYY(docDateRaw);

  const fromGstin = getString(record, mapping.fromGstin) || config.gstin;
  const fromStateCode = resolveStateCode(record[mapping.fromStateCode]);
  const toStateCode = resolveStateCode(record[mapping.toStateCode]);

  const fromPincode = getNumber(record, mapping.fromPincode);
  const toPincode = getNumber(record, mapping.toPincode);

  const transModeMapped = getString(record, mapping.transportMode) || '1';
  const transMode = (['1', '2', '3', '4'].includes(transModeMapped)
    ? transModeMapped
    : '1') as '1' | '2' | '3' | '4';

  const itemList: EWayBillItem[] = lineItems.map((item, index) => {
    const gstRateRaw = getNumber(item, mapping.itemGstRate);
    // Determine CGST/SGST vs IGST based on whether from/to states match
    const isInterState = fromStateCode !== toStateCode;
    const cgstRate = isInterState ? 0 : gstRateRaw / 2;
    const sgstRate = isInterState ? 0 : gstRateRaw / 2;
    const igstRate = isInterState ? gstRateRaw : 0;

    return {
      itemNo: index + 1,
      productName: getString(item, mapping.itemName),
      hsnCode: getString(item, mapping.itemHsn),
      quantity: getNumber(item, mapping.itemQty),
      qtyUnit: getString(item, mapping.itemUnit) || 'NOS',
      cgstRate,
      sgstRate,
      igstRate,
      taxableAmount: getNumber(item, mapping.itemTaxableAmount),
    };
  });

  return {
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo,
    docDate,
    fromGstin,
    fromTrdName: getString(record, mapping.fromName),
    fromAddr1: getString(record, mapping.fromAddress),
    fromPlace: getString(record, mapping.fromCity),
    fromPincode,
    fromStateCode,
    toGstin: getString(record, mapping.toGstin),
    toTrdName: getString(record, mapping.toName),
    toAddr1: getString(record, mapping.toAddress),
    toPlace: getString(record, mapping.toCity),
    toPincode,
    toStateCode,
    transactionType: 1,
    transDistance: getString(record, mapping.distance) || '0',
    transMode,
    vehicleNo: getString(record, mapping.vehicleNumber) || undefined,
    itemList,
  };
}
