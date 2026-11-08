import { runDrilldown } from '@/platform/analytics/drilldown';
import type { DrilldownConfig } from '@/platform/analytics/drilldown';

const sampleConfig: DrilldownConfig = {
  sourceMetric: 'total_sales', sourceTableApiKey: 'orders', aggregation: 'sum', aggregationField: 'amount',
  groupByField: 'month', drilldownLevels: [{ label: 'By Week', groupByField: 'week' }, { label: 'By Day', groupByField: 'day' }],
};

function makeMockPool(rows: Array<{ label: string; value: string }> = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('runDrilldown level 0', () => {
  it('returns level 0 aggregated by groupByField', async () => {
    const pool = makeMockPool([{ label: 'January', value: '50000' }, { label: 'February', value: '45000' }, { label: 'March', value: '60000' }]);
    const result = await runDrilldown(sampleConfig, 0, {}, 'app-123', 'acme', pool as never);
    expect(result.level).toBe(0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].label).toBe('January');
    expect(result.rows[0].value).toBe(50000);
    expect(result.rows[0].hasChildren).toBe(true);
    expect(result.rows[0].filter).toEqual({ month: 'January' });
  });

  it('uses correct SQL with tenant and app filters', async () => {
    const pool = makeMockPool([{ label: 'Q1', value: '100000' }]);
    await runDrilldown(sampleConfig, 0, {}, 'app-456', 'tenant-xyz', pool as never);
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SUM');
    expect(sql).toContain('month');
    expect(values[0]).toBe('tenant-xyz');
    expect(values[1]).toBe('app-456');
  });
});

describe('runDrilldown level 1', () => {
  it('applies parent filter and groups by next level field', async () => {
    const pool = makeMockPool([{ label: 'Week 1', value: '12000' }, { label: 'Week 2', value: '15000' }, { label: 'Week 3', value: '11000' }, { label: 'Week 4', value: '12000' }]);
    const result = await runDrilldown(sampleConfig, 1, { month: 'January' }, 'app-123', 'acme', pool as never);
    expect(result.level).toBe(1);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0].label).toBe('Week 1');
    expect(result.rows[0].value).toBe(12000);
    expect(result.rows[0].hasChildren).toBe(true);
    expect(result.rows[0].filter).toEqual({ month: 'January', week: 'Week 1' });
  });

  it('passes parent filter to SQL query', async () => {
    const pool = makeMockPool([{ label: 'Week 1', value: '5000' }]);
    await runDrilldown(sampleConfig, 1, { month: 'February' }, 'app-123', 'acme', pool as never);
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('week');
    expect(values).toContain('February');
  });
});

describe('runDrilldown level 2 (leaf)', () => {
  it('marks rows as hasChildren=false at the last level', async () => {
    const pool = makeMockPool([{ label: '2026-11-01', value: '3000' }, { label: '2026-11-02', value: '4000' }]);
    const result = await runDrilldown(sampleConfig, 2, { month: 'January', week: 'Week 1' }, 'app-123', 'acme', pool as never);
    expect(result.rows[0].hasChildren).toBe(false);
  });
});

describe('runDrilldown error cases', () => {
  it('throws when requesting a level that does not exist', async () => {
    const pool = makeMockPool([]);
    await expect(runDrilldown(sampleConfig, 5, {}, 'app-123', 'acme', pool as never)).rejects.toThrow('Drilldown level 5 does not exist');
  });

  it('handles count aggregation without field', async () => {
    const countConfig: DrilldownConfig = { ...sampleConfig, aggregation: 'count', aggregationField: undefined };
    const pool = makeMockPool([{ label: 'January', value: '42' }]);
    const result = await runDrilldown(countConfig, 0, {}, 'app-123', 'acme', pool as never);
    expect(result.rows[0].value).toBe(42);
    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('COUNT(*)');
  });
});
