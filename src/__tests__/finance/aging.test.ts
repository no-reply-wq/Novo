/**
 * Tests for aging report bucketing
 */

import { buildAgingReport } from '@/platform/finance/aging';
import type { Pool } from 'pg';

function makePool(rows: Record<string, unknown>[]): Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const BASE_OPTS = {
  partyType: 'customer' as const,
  invoiceTableApiKey: 'invoices',
  dueDateField: 'due_date',
  amountField: 'amount',
  partyField: 'customer_name',
  asOf: new Date().toISOString().slice(0, 10),
};

// ─────────────────────────────────────────────────────────────
// Bucket classification
// ─────────────────────────────────────────────────────────────

describe('buildAgingReport - bucket classification', () => {
  it('puts a future-due invoice in Current bucket', async () => {
    const rows = [
      { _id: '1', _party: 'Acme', _amount: '1000', _due_date: daysAgo(-5) },
    ];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.grandTotalByBucket[0].label).toBe('Current');
    expect(report.grandTotalByBucket[0].amount).toBe(1000);
  });

  it('puts a 15-day overdue invoice in 1-30 days bucket', async () => {
    const rows = [{ _id: '2', _party: 'Beta', _amount: '2000', _due_date: daysAgo(15) }];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.grandTotalByBucket[1].label).toBe('1-30 days');
    expect(report.grandTotalByBucket[1].amount).toBe(2000);
  });

  it('puts a 45-day overdue invoice in 31-60 days bucket', async () => {
    const rows = [{ _id: '3', _party: 'Gamma', _amount: '3000', _due_date: daysAgo(45) }];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.grandTotalByBucket[2].label).toBe('31-60 days');
    expect(report.grandTotalByBucket[2].amount).toBe(3000);
  });

  it('puts a 75-day overdue invoice in 61-90 days bucket', async () => {
    const rows = [{ _id: '4', _party: 'Delta', _amount: '4000', _due_date: daysAgo(75) }];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.grandTotalByBucket[3].label).toBe('61-90 days');
    expect(report.grandTotalByBucket[3].amount).toBe(4000);
  });

  it('puts a 100-day overdue invoice in 90+ days bucket', async () => {
    const rows = [{ _id: '5', _party: 'Echo', _amount: '5000', _due_date: daysAgo(100) }];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.grandTotalByBucket[4].label).toBe('90+ days');
    expect(report.grandTotalByBucket[4].amount).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────
// Party grouping
// ─────────────────────────────────────────────────────────────

describe('buildAgingReport - party grouping', () => {
  it('groups invoices by party name', async () => {
    const rows = [
      { _id: '1', _party: 'Acme', _amount: '1000', _due_date: daysAgo(5) },
      { _id: '2', _party: 'Acme', _amount: '2000', _due_date: daysAgo(10) },
      { _id: '3', _party: 'Beta', _amount: '500', _due_date: daysAgo(5) },
    ];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    const acme = report.parties.find((p) => p.name === 'Acme')!;
    expect(acme.total).toBe(3000);
    const beta = report.parties.find((p) => p.name === 'Beta')!;
    expect(beta.total).toBe(500);
  });

  it('calculates totalOutstanding correctly', async () => {
    const rows = [
      { _id: '1', _party: 'X', _amount: '1000', _due_date: daysAgo(10) },
      { _id: '2', _party: 'Y', _amount: '2000', _due_date: daysAgo(20) },
    ];
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool(rows));
    expect(report.totalOutstanding).toBe(3000);
  });

  it('returns empty report for no invoices', async () => {
    const report = await buildAgingReport('app1', 'tenant1', BASE_OPTS, makePool([]));
    expect(report.parties).toHaveLength(0);
    expect(report.totalOutstanding).toBe(0);
  });
});
