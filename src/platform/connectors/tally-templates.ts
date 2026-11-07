/**
 * Tally connector templates — XML-over-HTTP (port 9000) integration.
 * Builds XML requests, POSTs to Tally, parses XML responses.
 */

import { checkSsrf } from './ssrf-guard';

// ─── XML helpers ─────────────────────────────────────────────────────────────

function xmlTag(tag: string, content: string): string {
  return `<${tag}>${content}</${tag}>`;
}

function buildTallyRequest(xml: string): string {
  return `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY>${xml}</BODY></ENVELOPE>`;
}

async function postToTally(tallyUrl: string, xml: string): Promise<string> {
  checkSsrf(tallyUrl);

  const response = await fetch(tallyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Tally request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

// ─── Simple XML value extractor ───────────────────────────────────────────────

function extractTagValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function extractFirstTag(xml: string, tag: string): string {
  return extractTagValues(xml, tag)[0] ?? '';
}

function parseNumber(s: string): number {
  if (!s) return 0;
  // Tally sometimes uses "Dr" / "Cr" suffixes
  const cleaned = s.replace(/Dr|Cr/gi, '').trim();
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(n) ? 0 : (s.toLowerCase().includes('cr') ? -n : n);
}

// ─── Ledger export ────────────────────────────────────────────────────────────

export interface TallyLedgerEntry {
  name: string;
  openingBalance: number;
  closingBalance: number;
  transactions: Array<{ date: string; voucherType: string; amount: number; narration: string }>;
}

export async function fetchTallyLedger(
  tallyUrl: string,
  companyName: string,
  fromDate: string, // YYYYMMDD
  toDate: string,   // YYYYMMDD
): Promise<TallyLedgerEntry[]> {
  const requestXml = buildTallyRequest(
    xmlTag(
      'EXPORTDATA',
      xmlTag('REQUESTDESC',
        xmlTag('REPORTNAME', 'Ledger') +
        xmlTag('STATICVARIABLES',
          xmlTag('SVEXPORTFORMAT', '$$SysName:XML') +
          xmlTag('SVFROMDATE', fromDate) +
          xmlTag('SVTODATE', toDate) +
          xmlTag('SVCURRENTCOMPANY', companyName),
        ),
      ),
    ),
  );

  const responseXml = await postToTally(tallyUrl, requestXml);

  // Parse ledger blocks
  const ledgerBlocks = extractTagValues(responseXml, 'LEDGER');
  const results: TallyLedgerEntry[] = [];

  for (const block of ledgerBlocks) {
    const name = extractFirstTag(block, 'NAME');
    const openingBalance = parseNumber(extractFirstTag(block, 'OPENINGBALANCE'));
    const closingBalance = parseNumber(extractFirstTag(block, 'CLOSINGBALANCE'));

    // Parse transactions within this ledger
    const txnBlocks = extractTagValues(block, 'LEDGERVOUCHERS');
    const transactions = txnBlocks.map((txn) => ({
      date: extractFirstTag(txn, 'DATE'),
      voucherType: extractFirstTag(txn, 'VOUCHERTYPE'),
      amount: parseNumber(extractFirstTag(txn, 'AMOUNT')),
      narration: extractFirstTag(txn, 'NARRATION'),
    }));

    if (name) {
      results.push({ name, openingBalance, closingBalance, transactions });
    }
  }

  return results;
}

// ─── Voucher export ───────────────────────────────────────────────────────────

export interface TallyVoucher {
  date: string;
  voucherNumber: string;
  voucherType: string;
  narration: string;
  amount: number;
  ledgerEntries: Array<{ ledger: string; amount: number }>;
}

export async function exportVouchers(
  tallyUrl: string,
  companyName: string,
  voucherType: string,
  fromDate: string,
  toDate: string,
): Promise<TallyVoucher[]> {
  const requestXml = buildTallyRequest(
    xmlTag(
      'EXPORTDATA',
      xmlTag('REQUESTDESC',
        xmlTag('REPORTNAME', 'Voucher Register') +
        xmlTag('STATICVARIABLES',
          xmlTag('SVEXPORTFORMAT', '$$SysName:XML') +
          xmlTag('SVFROMDATE', fromDate) +
          xmlTag('SVTODATE', toDate) +
          xmlTag('SVCURRENTCOMPANY', companyName) +
          xmlTag('VOUCHERTYPENAME', voucherType),
        ),
      ),
    ),
  );

  const responseXml = await postToTally(tallyUrl, requestXml);

  const voucherBlocks = extractTagValues(responseXml, 'VOUCHER');
  const results: TallyVoucher[] = [];

  for (const block of voucherBlocks) {
    const date = extractFirstTag(block, 'DATE');
    const voucherNumber = extractFirstTag(block, 'VOUCHERNUMBER');
    const vType = extractFirstTag(block, 'VOUCHERTYPENAME');
    const narration = extractFirstTag(block, 'NARRATION');
    const amount = parseNumber(extractFirstTag(block, 'AMOUNT'));

    const ledgerBlocks = extractTagValues(block, 'ALLLEDGERENTRIES');
    const ledgerEntries = ledgerBlocks.map((lb) => ({
      ledger: extractFirstTag(lb, 'LEDGERNAME'),
      amount: parseNumber(extractFirstTag(lb, 'AMOUNT')),
    }));

    results.push({ date, voucherNumber, voucherType: vType, narration, amount, ledgerEntries });
  }

  return results;
}
