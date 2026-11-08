/**
 * GSTR-1 & GSTR-3B Builder
 * Queries tenant invoice tables, classifies B2B/B2C/export,
 * calculates CGST/SGST (intra-state) or IGST (inter-state).
 */

import { Pool } from 'pg';
import type { GstrEntry, Gstr1Report, Gstr3bSummary } from './types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseStateCode(gstin: string): string {
  return gstin.substring(0, 2);
}

function classifyEntry(row: Record<string, unknown>, tenantStateCode: string): GstrEntry {
  const customerGstin = (row['customer_gstin'] ?? row['customerGstin'] ?? '') as string;
  const placeOfSupply = (row['place_of_supply'] ?? row['placeOfSupply'] ?? '') as string;
  const taxableAmount = Number(row['taxable_amount'] ?? row['taxableAmount'] ?? 0);
  const isInterState = placeOfSupply !== '' && placeOfSupply !== tenantStateCode;
  const isExport = (row['invoice_type'] ?? row['invoiceType'] ?? '') === 'export';

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isExport) {
    // exports are zero-rated
    igst = 0;
  } else if (isInterState || (!customerGstin && placeOfSupply !== tenantStateCode)) {
    igst = Number(row['igst'] ?? row['igst_amount'] ?? 0);
  } else {
    cgst = Number(row['cgst'] ?? row['cgst_amount'] ?? 0);
    sgst = Number(row['sgst'] ?? row['sgst_amount'] ?? 0);
  }

  const invoiceType: GstrEntry['invoiceType'] = isExport
    ? 'export'
    : customerGstin
    ? 'B2B'
    : 'B2C';

  return {
    invoiceNumber: String(row['invoice_number'] ?? row['invoiceNumber'] ?? ''),
    invoiceDate: String(row['invoice_date'] ?? row['invoiceDate'] ?? ''),
    customerGstin: customerGstin || undefined,
    customerName: String(row['customer_name'] ?? row['customerName'] ?? ''),
    placeOfSupply,
    taxableAmount,
    cgst,
    sgst,
    igst,
    cess: row['cess'] != null ? Number(row['cess']) : undefined,
    invoiceType,
  };
}

// ─────────────────────────────────────────────────────────────
// buildGstr1
// ─────────────────────────────────────────────────────────────

export async function buildGstr1(
  appId: string,
  tenantSlug: string,
  period: string,  // 'MM-YYYY'
  invoiceTableApiKey: string,
  pgPool: Pool,
): Promise<Gstr1Report> {
  const [mm, yyyy] = period.split('-');
  const monthNum = parseInt(mm, 10);
  const yearNum = parseInt(yyyy, 10);
  const startDate = new Date(yearNum, monthNum - 1, 1).toISOString().slice(0, 10);
  const endDate = new Date(yearNum, monthNum, 0).toISOString().slice(0, 10);

  // Resolve GSTIN and state code from app config
  const cfgResult = await pgPool.query<{ gstin: string }>(
    `SELECT config->>'gstin' AS gstin
       FROM platform.gstr1_configs
      WHERE app_id = $1`,
    [appId],
  );

  const gstin = cfgResult.rows[0]?.gstin ?? '';
  const tenantStateCode = gstin ? parseStateCode(gstin) : '';

  // Fetch invoices for the period from the tenant schema
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  const rows = await pgPool.query<Record<string, unknown>>(
    `SELECT *
       FROM ${schemaName}.${invoiceTableApiKey}
      WHERE (invoice_date::date >= $1 AND invoice_date::date <= $2)
         OR (\"invoiceDate\"::date >= $1 AND \"invoiceDate\"::date <= $2)`,
    [startDate, endDate],
  );

  const b2b: GstrEntry[] = [];
  const b2c: GstrEntry[] = [];
  const exports: GstrEntry[] = [];

  for (const row of rows.rows) {
    const entry = classifyEntry(row, tenantStateCode);
    if (entry.invoiceType === 'B2B') b2b.push(entry);
    else if (entry.invoiceType === 'export') exports.push(entry);
    else b2c.push(entry);
  }

  const all = [...b2b, ...b2c, ...exports];
  const totalTaxableValue = all.reduce((s, e) => s + e.taxableAmount, 0);
  const totalTax = all.reduce((s, e) => s + e.cgst + e.sgst + e.igst + (e.cess ?? 0), 0);

  return { gstin, period, b2b, b2c, exports, totalTaxableValue, totalTax };
}

// ─────────────────────────────────────────────────────────────
// buildGstr3b
// ─────────────────────────────────────────────────────────────

export async function buildGstr3b(
  appId: string,
  tenantSlug: string,
  period: string,
  pgPool: Pool,
): Promise<Gstr3bSummary> {
  const [mm, yyyy] = period.split('-');
  const monthNum = parseInt(mm, 10);
  const yearNum = parseInt(yyyy, 10);
  const fp = `${mm.padStart(2, '0')}${yyyy}`;

  // Try to load from an existing GSTR1 filing
  const filingResult = await pgPool.query<{
    total_taxable_value: string;
    total_tax: string;
  }>(
    `SELECT total_taxable_value, total_tax
       FROM platform.gstr1_filings
      WHERE tenant_slug = $1 AND period = $2`,
    [tenantSlug, fp],
  );

  let outwardTaxableSupplies = 0;
  let outwardTaxAmount = 0;

  if (filingResult.rows.length > 0) {
    outwardTaxableSupplies = Number(filingResult.rows[0].total_taxable_value);
    outwardTaxAmount = Number(filingResult.rows[0].total_tax);
  } else {
    // Fall back: query the tenant schema directly
    const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
    const startDate = new Date(yearNum, monthNum - 1, 1).toISOString().slice(0, 10);
    const endDate = new Date(yearNum, monthNum, 0).toISOString().slice(0, 10);
    const result = await pgPool.query<{ txval: string; tax: string }>(
      `SELECT
           COALESCE(SUM(COALESCE(taxable_amount::numeric, 0)), 0) AS txval,
           COALESCE(SUM(
             COALESCE(cgst::numeric,0) + COALESCE(sgst::numeric,0) + COALESCE(igst::numeric,0)
           ), 0) AS tax
         FROM ${schemaName}.invoices
        WHERE invoice_date::date BETWEEN $1 AND $2`,
      [startDate, endDate],
    );
    outwardTaxableSupplies = Number(result.rows[0]?.txval ?? 0);
    outwardTaxAmount = Number(result.rows[0]?.tax ?? 0);
  }

  // ITC claimed — query purchase/expense table if available
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  const startDate2 = new Date(yearNum, monthNum - 1, 1).toISOString().slice(0, 10);
  const endDate2 = new Date(yearNum, monthNum, 0).toISOString().slice(0, 10);
  let inwardITCClaimed = 0;
  try {
    const itcResult = await pgPool.query<{ itc: string }>(
      `SELECT COALESCE(SUM(
           COALESCE(cgst::numeric,0) + COALESCE(sgst::numeric,0) + COALESCE(igst::numeric,0)
         ), 0) AS itc
         FROM ${schemaName}.purchases
        WHERE invoice_date::date BETWEEN $1 AND $2`,
      [startDate2, endDate2],
    );
    inwardITCClaimed = Number(itcResult.rows[0]?.itc ?? 0);
  } catch {
    // purchases table may not exist — ITC stays 0
  }

  const netTaxPayable = Math.max(0, outwardTaxAmount - inwardITCClaimed);

  return {
    period,
    outwardTaxableSupplies,
    outwardTaxAmount,
    inwardITCClaimed,
    netTaxPayable,
  };
}

// ─────────────────────────────────────────────────────────────
// Export helpers
// ─────────────────────────────────────────────────────────────

export function exportGstr1ToJson(report: Gstr1Report): string {
  const [mm, yyyy] = report.period.split('-');
  const fp = `${mm.padStart(2, '0')}${yyyy}`;

  const gstnPayload = {
    gstin: report.gstin,
    fp,
    b2b: report.b2b.map((e) => ({
      ctin: e.customerGstin,
      inv: [
        {
          inum: e.invoiceNumber,
          idt: e.invoiceDate,
          val: e.taxableAmount + e.cgst + e.sgst + e.igst + (e.cess ?? 0),
          pos: e.placeOfSupply,
          rchrg: 'N',
          itms: [
            {
              num: 1,
              itm_det: {
                txval: e.taxableAmount,
                rt: 0,
                iamt: e.igst || undefined,
                camt: e.cgst || undefined,
                samt: e.sgst || undefined,
                csamt: e.cess || undefined,
              },
            },
          ],
        },
      ],
    })),
    b2c: report.b2c.map((e) => ({
      pos: e.placeOfSupply,
      sply_ty: 'INTER',
      txval: e.taxableAmount,
      iamt: e.igst || undefined,
      camt: e.cgst || undefined,
      samt: e.sgst || undefined,
      csamt: e.cess || undefined,
    })),
    exp: report.exports.map((e) => ({
      expTyp: 'WPAY',
      inv: [
        {
          inum: e.invoiceNumber,
          idt: e.invoiceDate,
          val: e.taxableAmount,
          itms: [{ txval: e.taxableAmount, rt: 0, iamt: 0 }],
        },
      ],
    })),
  };

  return JSON.stringify(gstnPayload, null, 2);
}

export function exportGstr1ToCsv(report: Gstr1Report): string {
  const rows: string[] = [
    'Invoice Number,Invoice Date,Customer GSTIN,Customer Name,Place of Supply,Taxable Amount,CGST,SGST,IGST,Cess,Invoice Type',
  ];

  const all = [...report.b2b, ...report.b2c, ...report.exports];
  for (const e of all) {
    rows.push(
      [
        e.invoiceNumber,
        e.invoiceDate,
        e.customerGstin ?? '',
        `"${e.customerName.replace(/"/g, '""')}"`,
        e.placeOfSupply,
        e.taxableAmount.toFixed(2),
        e.cgst.toFixed(2),
        e.sgst.toFixed(2),
        e.igst.toFixed(2),
        (e.cess ?? 0).toFixed(2),
        e.invoiceType,
      ].join(','),
    );
  }

  return rows.join('\n');
}
