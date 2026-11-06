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

describe('importApp', () => {
  let inserts: string[][];
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    inserts = [];
    queryMock = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.startsWith('INSERT') || sql.startsWith('DELETE') || sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        if (sql.startsWith('INSERT')) inserts.push([sql, ...(params ?? []).map(String)]);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (sql.includes('SELECT id FROM public.apps')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  async function runImport(bundle: AppBundle, overrides = {}) {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    const { importApp } = await import('../importer');
    const fakeClient = { query: queryMock, release: vi.fn() } as unknown as PoolClient;
    return importApp(bundle, { tenant: 'acme', mergeMode: 'merge', ...overrides }, fakeClient);
  }

  it('creates app with correct name', async () => {
    const result = await runImport(makeMockBundle(), { newAppName: 'My New App' });
    expect(result.appName).toBe('My New App');
    const appInsert = inserts.find(i => i[0].includes('INSERT INTO public.apps'));
    expect(appInsert).toBeDefined();
    expect(appInsert?.[2]).toBe('My New App');
  });

  it('uses bundle appName when newAppName not provided', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.appName).toBe('Original App');
  });

  it('creates all tables', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.tablesCreated).toBe(2);
  });

  it('creates all pages', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.pagesCreated).toBe(2);
  });

  it('creates all workflows', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.workflowsCreated).toBe(1);
  });

  it('creates all scripts', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.scriptsCreated).toBe(1);
  });

  it('skip mode returns 0 counts when app exists', async () => {
    queryMock.mockImplementationOnce(() => Promise.resolve({ rows: [], rowCount: 0 })); // BEGIN
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM public.apps')) {
        return Promise.resolve({ rows: [{ id: 'existing-id' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    const { importApp } = await import('../importer');
    const fakeClient = { query: queryMock, release: vi.fn() } as unknown as PoolClient;
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'skip' }, fakeClient);
    expect(result.tablesCreated).toBe(0);
    expect(result.warnings.some(w => w.includes('skip'))).toBe(true);
  });

  it('replace mode includes DELETE calls', async () => {
    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id FROM public.apps')) {
        return Promise.resolve({ rows: [{ id: 'old-id' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    const { importApp } = await import('../importer');
    const deletes: string[] = [];
    const captureClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.startsWith('DELETE')) deletes.push(sql);
        if (sql.includes('SELECT id FROM public.apps')) {
          return Promise.resolve({ rows: [{ id: 'old-id' }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'replace' }, captureClient);
    expect(deletes.length).toBeGreaterThan(0);
  });

  it('warns about secrets for connectors with _secretsExcluded', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.warnings.some(w => w.includes('Stripe') && w.includes('secret'))).toBe(true);
  });

  it('skipExistingTables skips tables that exist', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM public.apps') && !sql.includes('platform')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('SELECT id FROM platform.tables')) {
        return Promise.resolve({ rows: [{ id: 'existing-tbl' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    const { importApp } = await import('../importer');
    const fakeClient = { query: queryMock, release: vi.fn() } as unknown as PoolClient;
    const result = await importApp(makeMockBundle(), { tenant: 'acme', mergeMode: 'merge', skipExistingTables: true }, fakeClient);
    expect(result.tablesCreated).toBe(0);
  });

  it('appId is UUID-like', async () => {
    const result = await runImport(makeMockBundle());
    expect(result.appId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
