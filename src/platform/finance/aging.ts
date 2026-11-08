/**
 * Aging Report — buckets outstanding invoices by days overdue
 */

import { Pool } from 'pg';

export interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  invoiceIds: string[];
}

export interface AgingReport {
  asOf: string;
  partyType: 'customer' | 'supplier';
  parties: Array<{
    name: string;
    total: number;
    buckets: AgingBucket[];
  }>;
  totalOutstanding: number;
  grandTotalByBucket: AgingBucket[];
}

const BUCKET_LABELS = ['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days'];

function emptyBuckets(): AgingBucket[] {
  return BUCKET_LABELS.map((label) => ({ label, amount: 0, count: 0, invoiceIds: [] }));
}

function bucketIndex(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  if (daysOverdue <= 30) return 1;
  if (daysOverdue <= 60) return 2;
  if (daysOverdue <= 90) return 3;
  return 4;
}

export async function buildAgingReport(
  appId: string,
  tenantSlug: string,
  opts: {
    partyType: 'customer' | 'supplier';
    invoiceTableApiKey: string;
    dueDateField: string;
    amountField: string;
    partyField: string;
    asOf?: string;
  },
  pgPool: Pool,
): Promise<AgingReport> {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const { invoiceTableApiKey, dueDateField, amountField, partyField } = opts;

  // Dynamically build query with safe field references
  const safeField = (f: string) => `"${f.replace(/"/g, '')}"`;
  const rows = await pgPool.query<Record<string, unknown>>(
    `SELECT
         id::text AS _id,
         ${safeField(partyField)} AS _party,
         ${safeField(amountField)}::numeric AS _amount,
         ${safeField(dueDateField)}::date AS _due_date
       FROM ${schemaName}.${invoiceTableApiKey}
      WHERE ${safeField(amountField)} IS NOT NULL
        AND ${safeField(dueDateField)} IS NOT NULL`,
  );

  const partyMap = new Map<string, { buckets: AgingBucket[]; total: number }>();
  const grandBuckets = emptyBuckets();

  for (const row of rows.rows) {
    const party = String(row['_party'] ?? 'Unknown');
    const amount = Number(row['_amount'] ?? 0);
    const dueDate = new Date(String(row['_due_date']));
    const asOfDate = new Date(asOf);
    const daysOverdue = Math.floor((asOfDate.getTime() - dueDate.getTime()) / 86400000);
    const idx = bucketIndex(daysOverdue);
    const id = String(row['_id'] ?? '');

    if (!partyMap.has(party)) {
      partyMap.set(party, { buckets: emptyBuckets(), total: 0 });
    }

    const partyData = partyMap.get(party)!;
    partyData.buckets[idx].amount += amount;
    partyData.buckets[idx].count += 1;
    partyData.buckets[idx].invoiceIds.push(id);
    partyData.total += amount;

    grandBuckets[idx].amount += amount;
    grandBuckets[idx].count += 1;
    grandBuckets[idx].invoiceIds.push(id);
  }

  const parties = Array.from(partyMap.entries()).map(([name, data]) => ({
    name,
    total: data.total,
    buckets: data.buckets,
  }));

  const totalOutstanding = parties.reduce((s, p) => s + p.total, 0);

  return {
    asOf,
    partyType: opts.partyType,
    parties,
    totalOutstanding,
    grandTotalByBucket: grandBuckets,
  };
}
