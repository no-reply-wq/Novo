import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';

vi.mock('@/lib/db/client', () => ({
  pgPool: { connect: vi.fn() },
}));

function makeQueryMock(appExists = true) {
  return vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('FROM public.apps')) {
      return Promise.resolve({
        rowCount: appExists ? 1 : 0,
        rows: appExists ? [{ id: params?.[0], name: 'Test App', slug: 'test-app' }] : [],
      });
    }
    if (sql.includes('platform.tables')) {
      return Promise.resolve({
        rows: [
          { id: 'table-1', name: 'orders', display_name: 'Orders', config: {}, app_id: params?.[0] },
          { id: 'table-2', name: 'items', display_name: 'Items', config: {}, app_id: params?.[0] },
        ],
      });
    }
    if (sql.includes('platform.table_fields')) {
      return Promise.resolve({ rows: [{ id: 'f1', table_id: 'table-1', name: 'amount', field_type: 'number', config: {} }] });
    }
    if (sql.includes('platform.pages')) {
      return Promise.resolve({ rows: [{ id: 'p1', name: 'Dashboard', config: {} }] });
    }
    if (sql.includes('platform.scripts')) {
      return Promise.resolve({ rows: [{ id: 's1', name: 'OnCreate', code: 'console.log("hi")', trigger_type: 'record_create', config: {} }] });
    }
    if (sql.includes('platform.rest_connectors')) {
      return Promise.resolve({ rows: [{ id: 'rc1', app_id: params?.[0], name: 'Stripe', base_url: 'https://api.stripe.com', config: { key: 'sk_live_secret' } }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

function makeFakeClient(appExists = true): PoolClient {
  return { query: makeQueryMock(appExists), release: vi.fn() } as unknown as PoolClient;
}

describe('exportApp', () => {
  it('throws if app not found', async () => {
    const { exportApp } = await import('../exporter');
    await expect(exportApp('bad-id', 'tenant1', makeFakeClient(false))).rejects.toThrow('App not found');
  });

  it('exports all tables', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.schema.tables).toHaveLength(2);
  });

  it('exports pages', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.ui.pages).toHaveLength(1);
  });

  it('exports scripts with code', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.scripts).toHaveLength(1);
    expect((bundle.scripts[0] as unknown as Record<string, unknown>).code).toBeTruthy();
  });

  it('excludes secrets from REST connectors', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.integrations.restConnectors[0]._secretsExcluded).toBe(true);
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('sk_live_secret');
  });

  it('bundle round-trips JSON', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    const parsed = JSON.parse(JSON.stringify(bundle)) as { bundleVersion: number };
    expect(parsed.bundleVersion).toBe(1);
  });

  it('version matches YYYY.M.D format', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exportedAt is valid ISO string', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(() => new Date(bundle.exportedAt)).not.toThrow();
  });

  it('tables include _originalId', async () => {
    const { exportApp } = await import('../exporter');
    const bundle = await exportApp('app-1', 'tenant1', makeFakeClient());
    expect(bundle.schema.tables[0]._originalId).toBe('table-1');
  });
});
