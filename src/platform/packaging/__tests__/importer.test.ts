import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import type { AppBundle } from '../types';

vi.mock('@/lib/db/client', () => ({
  pgPool: { connect: vi.fn() },
}));

function makeMockBundle(overrides: Partial<AppBundle> = {}): AppBundle {
  return {
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    appId: 'orig-app-1',
    appName: 'Original App',
    appSlug: 'original-app',
    version: '2026.1.1',
    schema: {
      tables: [
        { _originalId: 'tbl-1', name: 'orders', display_name: 'Orders', config: {}, fields: [], relations: [], childConfigs: [] },
        { _originalId: 'tbl-2', name: 'items', display_name: 'Items', config: {}, fields: [], relations: [], childConfigs: [] },
      ],
    },
    ui: {
      pages: [
        { id: 'pg-1', name: 'Dashboard', config: {} },
        { id: 'pg-2', name: 'Orders', config: {} },
      ],
      navItems: [],
      theme: null,
    },
    logic: {
      workflows: [{ id: 'wf-1', name: 'Send Email', config: {} }],
      approvalFlows: [],
      schedules: [],
      accessRules: [],
      fieldPermissions: [],
    },
    scripts: [{ name: 'OnCreate', code: 'log()', trigger_type: 'record_create', config: {} }],
    templates: { pdf: [], email: [] },
    integrations: {
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [{ id: 'rc-1', name: 'Stripe', base_url: 'https://api.stripe.com', _secretsExcluded: true }],
    },
    ...overrides,
  };
}

function makeDefaultClient(): PoolClient {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM public.apps')) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

describe('importApp', () => {
  it('creates app with correct name', async () => {
    const { importApp } = await import('../importer');
    const inserts: string[][] = [];
    const fakeClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.startsWith('INSERT')) inserts.push([sql, ...(params ?? []).map(String)]);
        if (sql.includes('SELECT id FROM public.apps')) return Promise.resolve({ rows: [], rowCount: 0 });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge', newAppName: 'My New App' }, fakeClient);
    expect(result.appName).toBe('My New App');
    const appInsert = inserts.find(i => i[0].includes('INSERT INTO public.apps'));
    expect(appInsert?.[2]).toBe('My New App');
  });

  it('uses bundle appName when newAppName not provided', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.appName).toBe('Original App');
  });

  it('creates all tables', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.tablesCreated).toBe(2);
  });

  it('creates all pages', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.pagesCreated).toBe(2);
  });

  it('creates all workflows', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.workflowsCreated).toBe(1);
  });

  it('creates all scripts', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.scriptsCreated).toBe(1);
  });

  it('skip mode returns 0 counts when app exists', async () => {
    const { importApp } = await import('../importer');
    const fakeClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM public.apps')) return Promise.resolve({ rows: [{ id: 'existing-id' }], rowCount: 1 });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'skip' }, fakeClient);
    expect(result.tablesCreated).toBe(0);
    expect(result.warnings.some(w => w.includes('skip'))).toBe(true);
  });

  it('replace mode includes DELETE calls', async () => {
    const { importApp } = await import('../importer');
    const deletes: string[] = [];
    const fakeClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.startsWith('DELETE')) deletes.push(sql);
        if (sql.includes('SELECT id FROM public.apps')) return Promise.resolve({ rows: [{ id: 'old-id' }], rowCount: 1 });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'replace' }, fakeClient);
    expect(deletes.length).toBeGreaterThan(0);
  });

  it('warns about secrets for connectors with _secretsExcluded', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.warnings.some(w => w.includes('Stripe') && w.toLowerCase().includes('secret'))).toBe(true);
  });

  it('skipExistingTables skips tables that exist', async () => {
    const { importApp } = await import('../importer');
    const fakeClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM public.apps') && !sql.includes('platform')) return Promise.resolve({ rows: [], rowCount: 0 });
        if (sql.includes('SELECT id FROM platform.tables')) return Promise.resolve({ rows: [{ id: 'existing-tbl' }], rowCount: 1 });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge', skipExistingTables: true }, fakeClient);
    expect(result.tablesCreated).toBe(0);
  });

  it('appId is UUID-like', async () => {
    const { importApp } = await import('../importer');
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge' }, makeDefaultClient());
    expect(result.appId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
