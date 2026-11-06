/**
 * TDS Calculator
 * Computes TDS amounts, rates, and thresholds for a given payment.
 */

import { getTDSSection } from './rules';

export interface TDSCalculationInput {
  amount: number;              // payment amount in ₹
  section: string;             // e.g. "194C"
  vendorType: 'individual' | 'huf' | 'company' | 'other';
  hasPAN: boolean;
  financialYear: string;       // "2024-25"
  ytdPayments?: number;        // year-to-date payments to same vendor under same section
}

export interface TDSCalculationResult {
  grossAmount: number;
  tdsRate: number;             // actual rate applied
  tdsAmount: number;           // amount to deduct (rounded to 2 decimal places)
  netAmount: number;           // amount to pay vendor
  section: string;
  thresholdApplied: boolean;   // true if below threshold (TDS = 0)
  reason: string;              // human-readable explanation
}

/**
 * Calculate TDS for a single payment.
 *
 * Logic:
 * 1. Look up section rules.
 * 2. If PAN absent → apply ratePANAbsent (skip threshold checks for PAN-absent rule, but
 *    thresholds still apply — TDS is deducted only once the threshold is crossed).
 * 3. Check single-payment threshold: if thresholdSingle > 0 and amount < thresholdSingle → TDS = 0.
 * 4. Check annual threshold: if thresholdAnnual > 0 and (ytd + amount) < thresholdAnnual → TDS = 0.
 * 5. Apply rate based on vendorType + hasPAN.
 */
export function calculateTDS(input: TDSCalculationInput): TDSCalculationResult {
  const { amount, section, vendorType, hasPAN, ytdPayments = 0 } = input;

  const sectionRule = getTDSSection(section);
  if (!sectionRule) {
    return {
      grossAmount: amount,
      tdsRate: 0,
      tdsAmount: 0,
      netAmount: amount,
      section,
      thresholdApplied: false,
      reason: `Unknown TDS section "${section}". No TDS applied.`,
    };
  }

  // Single-payment threshold check
  if (sectionRule.thresholdSingle > 0 && amount < sectionRule.thresholdSingle) {
    return {
      grossAmount: amount,
      tdsRate: 0,
      tdsAmount: 0,
      netAmount: amount,
      section,
      thresholdApplied: true,
      reason: `Payment ₹${amount.toLocaleString('en-IN')} is below single-payment threshold ` +
        `₹${sectionRule.thresholdSingle.toLocaleString('en-IN')} for section ${section}. No TDS deducted.`,
    };
  }

  // Annual threshold check
  if (sectionRule.thresholdAnnual > 0) {
    const cumulative = ytdPayments + amount;
    if (cumulative < sectionRule.thresholdAnnual) {
      return {
        grossAmount: amount,
        tdsRate: 0,
        tdsAmount: 0,
        netAmount: amount,
        section,
        thresholdApplied: true,
        reason: `Cumulative payments ₹${cumulative.toLocaleString('en-IN')} (YTD ₹${ytdPayments.toLocaleString('en-IN')} + ` +
          `this payment ₹${amount.toLocaleString('en-IN')}) are below annual threshold ` +
          `₹${sectionRule.thresholdAnnual.toLocaleString('en-IN')} for section ${section}. No TDS deducted.`,
      };
    }
  }

  // Determine applicable rate
  let tdsRate: number;
  let rateReason: string;

  if (!hasPAN) {
    tdsRate = sectionRule.ratePANAbsent;
    rateReason = `PAN not provided — higher rate of ${tdsRate}% applied under section 206AA.`;
  } else if (vendorType === 'company') {
    tdsRate = sectionRule.rateCorporate;
    rateReason = `Corporate rate ${tdsRate}% applied for section ${section}.`;
  } else {
    // individual, huf, other — use individual rate
    tdsRate = sectionRule.rateIndividual;
    const typeLabel = vendorType === 'huf' ? 'HUF' : vendorType === 'individual' ? 'Individual' : 'Other';
    rateReason = `${typeLabel} rate ${tdsRate}% applied for section ${section}.`;
  }

  const tdsAmount = roundToTwoDecimals((amount * tdsRate) / 100);
  const netAmount = roundToTwoDecimals(amount - tdsAmount);

  return {
    grossAmount: amount,
    tdsRate,
    tdsAmount,
    netAmount,
    section,
    thresholdApplied: false,
    reason: rateReason,
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Quarterly Summary
// ─────────────────────────────────────────────────────────────

export interface TDSSummary {
  section: string;
  vendorName: string;
  vendorPAN: string;
  totalPayments: number;
  totalTDS: number;
  netPayments: number;
  financialYear: string;
}

interface PaymentRecord {
  vendorId: string;
  vendorName: string;
  vendorPAN: string;
  amount: number;
  tdsAmount: number;
  section: string;
  date: string;
}

/**
 * Compute a quarterly TDS summary grouped by vendor + section.
 * Quarter date ranges (financial year starts April):
 *   Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar
 */
export function computeQuarterlySummary(params: {
  payments: PaymentRecord[];
  quarter: 1 | 2 | 3 | 4;
  financialYear: string;
}): TDSSummary[] {
  const { payments, quarter, financialYear } = params;

  // Derive start year from "2024-25" → 2024
  const startYear = parseInt(financialYear.split('-')[0] ?? '2024', 10);

  const quarterRange = getQuarterDateRange(quarter, startYear);

  const filtered = payments.filter(p => {
    const d = new Date(p.date);
    return d >= quarterRange.start && d <= quarterRange.end;
  });

  // Group by vendorPAN + section (use vendorId + section as fallback key when PAN absent)
  const groups = new Map<string, TDSSummary>();

  for (const payment of filtered) {
    const key = `${payment.vendorPAN || payment.vendorId}__${payment.section}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalPayments = roundToTwoDecimals(existing.totalPayments + payment.amount);
      existing.totalTDS = roundToTwoDecimals(existing.totalTDS + payment.tdsAmount);
      existing.netPayments = roundToTwoDecimals(existing.netPayments + (payment.amount - payment.tdsAmount));
    } else {
      groups.set(key, {
        section: payment.section,
        vendorName: payment.vendorName,
        vendorPAN: payment.vendorPAN,
        totalPayments: payment.amount,
        totalTDS: payment.tdsAmount,
        netPayments: roundToTwoDecimals(payment.amount - payment.tdsAmount),
        financialYear,
      });
    }
  }

  return Array.from(groups.values());
}

interface DateRange {
  start: Date;
  end: Date;
}

function getQuarterDateRange(quarter: 1 | 2 | 3 | 4, startYear: number): DateRange {
  switch (quarter) {
    case 1:
      return { start: new Date(startYear, 3, 1), end: new Date(startYear, 5, 30, 23, 59, 59) };       // Apr–Jun
    case 2:
      return { start: new Date(startYear, 6, 1), end: new Date(startYear, 8, 30, 23, 59, 59) };       // Jul–Sep
    case 3:
      return { start: new Date(startYear, 9, 1), end: new Date(startYear, 11, 31, 23, 59, 59) };      // Oct–Dec
    case 4:
      return { start: new Date(startYear + 1, 0, 1), end: new Date(startYear + 1, 2, 31, 23, 59, 59) }; // Jan–Mar
  }
}
