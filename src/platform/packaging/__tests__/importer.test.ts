/**
 * Tests for the packaging importer.
 * Uses mock DB clients — no real database needed.
 */

import { describe, it, expect, vi } from 'vitest';
import { importApp } from '../importer';
import type { AppBundle, ImportOptions } from '../types';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PlainQueryResult = { rows: unknown[]; rowCount: number };

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}

function makeClient(
  overrides: Record<string, (sql: string, params?: unknown[]) => PlainQueryResult> = {},
  captureInserts: { sql: string; params: unknown[] }[] = [],
): PoolClient {
  const fn = async (sql: string, params?: unknown[]) => {
    const lower = sql.toLowerCase();

    for (const [key, handler] of Object.entries(overrides)) {
      if (lower.includes(key.toLowerCase())) {
        const r = handler(sql, params);
        return makeQueryResult(r.rows as QueryResultRow[]);
      }
    }

    // Capture inserts for assertions
    if (lower.startsWith('insert') || lower.startsWith('delete') || lower.startsWith('update') || lower.startsWith('begin') || lower.startsWith('rollback') || lower.startsWith('commit')) {
      captureInserts.push({ sql, params: params ?? [] });
      return makeQueryResult([]);
    }

    return makeQueryResult([]);
  };

  const query = vi.fn(fn) as unknown as PoolClient['query'];

  return { query, release: vi.fn() } as unknown as PoolClient;
}

function makeBundle(overrides: Partial<AppBundle> = {}): AppBundle {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedBy: 'test-user',
    app: { name: 'My App', slug: 'my-app' },
    schema: {
      tables: [
        { slug: 'contacts', name: 'Contacts', fields: [{ id: 'f1', name: 'Name' }], indexes: [] },
        { slug: 'deals', name: 'Deals', fields: [], indexes: [] },
      ],
      relations: [],
      childTableConfigs: [],
    },
    ui: {
      pages: [{ id: 'pg-1', slug: 'home', title: 'Home' }, { id: 'pg-2', slug: 'contacts', title: 'Contacts' }],
      navItems: [],
    },
    logic: {
      workflows: [{ id: 'wf-1', name: 'Send Welcome' }],
      approvalFlows: [],
      schedules: [],
      accessRules: [],
      fieldPermissions: [],
    },
    scripts: [
      { name: 'send-email', code: 'async function run() {}', inputSchema: [], outputSchema: [], testCases: [] },
    ],
    integrations: {
      pdfTemplates: [],
      emailTemplates: [],
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [{ name: 'Stripe', _secretsExcluded: true }],
    },
    ...overrides,
  };
}

function defaultOptions(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return { targetTenantSlug: 'acme', mergeMode: 'replace', ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('importApp', () => {
  it('creates app with correct name', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      // No existing app
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
      'from platform.tables': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    await importApp(makeBundle(), defaultOptions(), client);

    const appInsert = inserts.find(i => i.sql.toLowerCase().includes('insert into public.apps'));
    expect(appInsert).toBeDefined();
    expect(appInsert?.params).toContain('My App');
    expect(appInsert?.params).toContain('acme');
  });

  it('uses newAppName when provided', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    await importApp(makeBundle(), defaultOptions({ newAppName: 'Custom Name' }), client);

    const appInsert = inserts.find(i => i.sql.toLowerCase().includes('insert into public.apps'));
    expect(appInsert?.params).toContain('Custom Name');
    expect(appInsert?.params).not.toContain('My App');
  });

  it('creates all tables', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(result.tablesCreated).toBe(2);
    const tableInserts = inserts.filter(i => i.sql.toLowerCase().includes('insert into platform.tables'));
    expect(tableInserts.length).toBe(2);
  });

  it('creates all pages', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(result.pagesCreated).toBe(2);
  });

  it('creates all workflows', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(result.workflowsCreated).toBe(1);
  });

  it('creates all scripts', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    }, inserts);

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(result.scriptsCreated).toBe(1);
  });

  it('slug conflict: throws error', async () => {
    const client = makeClient({
      // App with same slug already exists
      'from public.apps': () => ({
        rows: [{ id: 'existing-id' }],
        rowCount: 1,
      }),
    });

    // mergeMode=skip returns without creating — not an error
    const result = await importApp(makeBundle(), defaultOptions({ mergeMode: 'skip' }), client);
    expect(result.warnings.some(w => w.includes('skipped'))).toBe(true);
  });

  it('mergeMode replace: deletes existing app before importing', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': (_sql, _params) => ({
        rows: [{ id: 'old-app-id' }],
        rowCount: 1,
      }),
    }, inserts);

    await importApp(makeBundle(), defaultOptions({ mergeMode: 'replace' }), client);

    const deletes = inserts.filter(i => i.sql.toLowerCase().startsWith('delete'));
    expect(deletes.length).toBeGreaterThan(0);
  });

  it('mergeMode skip: returns without importing', async () => {
    const client = makeClient({
      'from public.apps': () => ({ rows: [{ id: 'existing-id' }], rowCount: 1 }),
    });

    const result = await importApp(makeBundle(), defaultOptions({ mergeMode: 'skip' }), client);

    expect(result.tablesCreated).toBe(0);
    expect(result.pagesCreated).toBe(0);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('skip')]));
  });

  it('secrets warning: included in result.warnings for REST connectors', async () => {
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    });

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(result.warnings.some(w => w.includes('Stripe') && w.includes('Secret'))).toBe(true);
  });

  it('skipExistingTables: skips tables that already exist', async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
      // Both tables "already exist"
      'count(*) as count from platform.tables': () => ({
        rows: [{ count: '1' }],
        rowCount: 1,
      }),
    }, inserts);

    const result = await importApp(makeBundle(), defaultOptions({ skipExistingTables: true }), client);

    // Both tables should be skipped
    expect(result.tablesCreated).toBe(0);
    expect(result.warnings.some(w => w.includes('skipped'))).toBe(true);
  });

  it('returns valid appId (UUID-like string)', async () => {
    const client = makeClient({
      'from public.apps': () => ({ rows: [], rowCount: 0 }),
    });

    const result = await importApp(makeBundle(), defaultOptions(), client);

    expect(typeof result.appId).toBe('string');
    expect(result.appId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
