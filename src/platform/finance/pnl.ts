/**
 * P&L Report — revenue vs expenses with gross/net profit
 */

import { Pool } from 'pg';

export interface PnlReport {
  period: { from: string; to: string };
  revenue: { category: string; amount: number }[];
  cogs: { category: string; amount: number }[];
  grossProfit: number;
  expenses: { category: string; amount: number }[];
  netProfit: number;
  margin: number;  // percentage
}

export async function buildPnlReport(
  appId: string,
  tenantSlug: string,
  opts: {
    from: string;
    to: string;
    revenueTableApiKey: string;
    expenseTableApiKey: string;
    amountField: string;
    categoryField: string;
  },
  pgPool: Pool,
): Promise<PnlReport> {
  const { from, to, revenueTableApiKey, expenseTableApiKey, amountField, categoryField } = opts;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const safeField = (f: string) => `"${f.replace(/"/g, '')}"`;

  async function aggregate(table: string): Promise<{ category: string; amount: number }[]> {
    const result = await pgPool.query<{ _cat: string; _total: string }>(
      `SELECT
           COALESCE(${safeField(categoryField)}, 'Uncategorized') AS _cat,
           SUM(${safeField(amountField)}::numeric) AS _total
         FROM ${schemaName}.${table}
        WHERE date::date BETWEEN $1 AND $2
        GROUP BY ${safeField(categoryField)}
        ORDER BY _total DESC`,
      [from, to],
    );
    return result.rows.map((r) => ({
      category: String(r['_cat'] ?? 'Uncategorized'),
      amount: Number(r['_total'] ?? 0),
    }));
  }

  const [revenueRows, expenseRows] = await Promise.all([
    aggregate(revenueTableApiKey),
    aggregate(expenseTableApiKey),
  ]);

  // Separate COGS from other expenses by category name convention
  const cogsKeywords = /\b(cogs|cost of goods|cost of sales|direct cost|raw material|purchase)\b/i;
  const cogs = expenseRows.filter((e) => cogsKeywords.test(e.category));
  const opex = expenseRows.filter((e) => !cogsKeywords.test(e.category));

  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalCogs = cogs.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalOpex = opex.reduce((s, r) => s + r.amount, 0);
  const netProfit = grossProfit - totalOpex;
  const margin = totalRevenue > 0 ? parseFloat(((netProfit / totalRevenue) * 100).toFixed(2)) : 0;

  return {
    period: { from, to },
    revenue: revenueRows,
    cogs,
    grossProfit,
    expenses: opex,
    netProfit,
    margin,
  };
}
