/**
 * Tally XML exporter.
 * Generates TALLYMESSAGE-format XML compatible with Tally ERP 9 and Tally Prime.
 */

import type { TallyVoucher, TallyVoucherMapping, TallyExportConfig } from './types';

/** Format ISO date "2024-01-15" to Tally date "20240115" */
function formatTallyDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/** Escape XML special characters */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Determine the sign convention for amounts in a voucher.
 * In Tally:
 *   Sales   → credit side (income) = negative amount
 *   Purchase → debit side (expense) = positive amount
 *   Receipt → positive
 *   Payment → negative
 *   Journal → as-is (mixed)
 */
function applyVoucherSign(amount: number, voucherType: TallyVoucher['voucherType']): number {
  switch (voucherType) {
    case 'Sales':
    case 'Payment':
      return -Math.abs(amount);
    case 'Purchase':
    case 'Receipt':
      return Math.abs(amount);
    case 'Journal':
      return amount;
  }
}

/** Render a single voucher as XML */
function renderVoucher(voucher: TallyVoucher): string {
  const tallyDate = formatTallyDate(voucher.date);
  const ledgerEntries = voucher.ledgerEntries
    .map((entry) => {
      const signedAmount = applyVoucherSign(entry.amount, voucher.voucherType);
      const taxLine = entry.taxRate !== undefined
        ? `\n              <BILLEDQTY>1</BILLEDQTY>\n              <RATE>${entry.taxRate}</RATE>`
        : '';
      return `          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>
            <AMOUNT>${signedAmount}</AMOUNT>${taxLine}
          </ALLLEDGERENTRIES.LIST>`;
    })
    .join('\n');

  const narrationLine = voucher.narration
    ? `\n          <NARRATION>${escapeXml(voucher.narration)}</NARRATION>`
    : '';

  return `        <VOUCHER VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Create">
          <DATE>${tallyDate}</DATE>
          <VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(voucher.partyName)}</PARTYLEDGERNAME>${narrationLine}
${ledgerEntries}
        </VOUCHER>`;
}

/**
 * Generate Tally-compatible XML for a list of vouchers.
 */
export function generateTallyXml(params: {
  vouchers: TallyVoucher[];
  config: TallyExportConfig;
}): string {
  const { vouchers } = params;

  const vouchersXml = vouchers.map(renderVoucher).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${vouchersXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Map a data record to a TallyVoucher using a field mapping config.
 * amountExpression supports simple "record.fieldName" syntax.
 */
export function recordToVoucher(
  record: Record<string, unknown>,
  mapping: TallyVoucherMapping
): TallyVoucher {
  function resolveExpression(expr: string): number {
    // Simple "record.fieldName" support
    const match = /^record\.([A-Za-z0-9_]+)$/.exec(expr.trim());
    if (match) {
      const fieldName = match[1];
      const val = record[fieldName ?? ''];
      return typeof val === 'number' ? val : Number(val ?? 0);
    }
    // Fallback: try numeric literal
    const num = Number(expr);
    return isNaN(num) ? 0 : num;
  }

  const dateVal = String(record[mapping.dateField] ?? '');
  const voucherNumberVal = String(record[mapping.voucherNumberField] ?? '');
  const partyNameVal = String(record[mapping.partyField] ?? '');
  const amountVal = typeof record[mapping.amountField] === 'number'
    ? (record[mapping.amountField] as number)
    : Number(record[mapping.amountField] ?? 0);

  const ledgerEntries = mapping.ledgerMappings.map((lm) => ({
    ledgerName: lm.ledgerName,
    amount: resolveExpression(lm.amountExpression),
  }));

  return {
    date: dateVal,
    voucherType: mapping.voucherType,
    voucherNumber: voucherNumberVal,
    partyName: partyNameVal,
    amount: amountVal,
    ledgerEntries,
  };
}
