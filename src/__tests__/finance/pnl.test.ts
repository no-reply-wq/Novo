/**
 * Tests for P&L report generation
 */

import { buildPnlReport } from '@/platform/finance/pnl';
import type { Pool } from 'pg';

function makePool(revenueRows: Record<string, unknown>[], expenseRows: Record<string, unknown>[]): Pool {
  let callCount = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) return Promise.resolve({ rows: revenueRows });
      return Promise.resolve({ rows: expenseRows });
    }),
  } as unknown as Pool;
}

const BASE_OPTS = {
  from: '2024-01-01',
  to: '2024-03-31',
  revenueTableApiKey: 'sales',
  expenseTableApiKey: 'expenses',
  amountField: 'amount',
  categoryField: 'category',
};

// ─────────────────────────────────────────────────────────────
// Revenue and expense aggregation
// ─────────────────────────────────────────────────────────────

describe('buildPnlReport', () => {
  it('sums revenue categories correctly', async () => {
    const revenue = [
      { _cat: 'Products', _total: '50000' },
      { _cat: 'Services', _total: '20000' },
    ];
    const expenses = [{ _cat: 'Office Rent', _total: '5000' }];
    const pool = makePool(revenue, expenses);

    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.revenue).toHaveLength(2);
    const productsRow = report.revenue.find((r) => r.category === 'Products')!;
    expect(productsRow.amount).toBe(50000);
  });

  it('calculates gross profit = revenue - COGS', async () => {
    const revenue = [{ _cat: 'Products', _total: '100000' }];
    const expenses = [
      { _cat: 'Cost of Goods', _total: '40000' },
      { _cat: 'Office Rent', _total: '10000' },
    ];
    const pool = makePool(revenue, expenses);

    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.cogs[0].category).toBe('Cost of Goods');
    expect(report.grossProfit).toBe(60000);
  });

  it('calculates net profit = gross profit - operating expenses', async () => {
    const revenue = [{ _cat: 'Revenue', _total: '100000' }];
    const expenses = [
      { _cat: 'COGS', _total: '30000' },
      { _cat: 'Salaries', _total: '20000' },
      { _cat: 'Rent', _total: '5000' },
    ];
    const pool = makePool(revenue, expenses);

    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.grossProfit).toBe(70000);  // 100k - 30k
    expect(report.netProfit).toBe(45000);    // 70k - 25k
  });

  it('calculates margin as percentage of revenue', async () => {
    const revenue = [{ _cat: 'Revenue', _total: '100000' }];
    const expenses = [{ _cat: 'Expenses', _total: '25000' }];
    const pool = makePool(revenue, expenses);

    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.margin).toBe(75);
  });

  it('returns margin 0 when revenue is 0', async () => {
    const pool = makePool([], []);
    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.margin).toBe(0);
    expect(report.netProfit).toBe(0);
    expect(report.grossProfit).toBe(0);
  });

  it('separates COGS from operating expenses using keyword matching', async () => {
    const revenue = [{ _cat: 'Sales', _total: '50000' }];
    const expenses = [
      { _cat: 'Raw Material', _total: '10000' },
      { _cat: 'Marketing', _total: '5000' },
      { _cat: 'Purchase', _total: '8000' },
    ];
    const pool = makePool(revenue, expenses);

    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.cogs).toHaveLength(2);  // Raw Material + Purchase
    expect(report.expenses).toHaveLength(1);  // Marketing only
  });

  it('includes period in report', async () => {
    const pool = makePool([], []);
    const report = await buildPnlReport('app1', 'tenant1', BASE_OPTS, pool);
    expect(report.period.from).toBe('2024-01-01');
    expect(report.period.to).toBe('2024-03-31');
  });
});
