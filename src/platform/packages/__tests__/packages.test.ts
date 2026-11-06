/**
 * Tests for the app packages export/import and versioning.
 *
 * Uses a mock PoolClient — no real database needed.
 */

import { exportApp } from '../exporter';
import { importApp } from '../importer';
import { createAppVersion, rollbackToVersion, listAppVersions } from '../versioning';
import type { AppPackage } from '../types';
import type { PoolClient } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

import type { QueryResult, QueryResultRow } from 'pg';

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] } as QueryResult<T>;
}

function makeQueryMock(rowSets: Record<string, unknown[]>): PoolClient['query'] {
  const calls: string[] = [];
  const fn = async (sql: string, _params?: unknown[]) => {
    calls.push(sql);
    // Match by first keyword + table name heuristic
    for (const [key, rows] of Object.entries(rowSets)) {
      if (sql.toLowerCase().includes(key.toLowerCase())) {
        const rowArr = Array.isArray(rows) ? rows : [rows];
        return makeQueryResult(rowArr as QueryResultRow[]);
      }
    }
    return makeQueryResult([]);
  };
  return fn as unknown as PoolClient['query'];
}

function makeAppRow() {
  return {
    id: 'app-uuid-1',
    tenant_slug: 'acme',
    name: 'Test App',
    description: 'A test app',
    icon: null,
    color: null,
    published_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };
}

function makeScriptRow() {
  return {
    id: 'script-1',
    app_id: 'app-uuid-1',
    name: 'GST Calculator',
    description: null,
    language: 'javascript',
    code: 'export default async function run() { return 42; }',
    version: 1,
    published_at: null,
    updated_at: new Date(),
    created_at: new Date(),
  };
}

// ─── exportApp tests ──────────────────────────────────────────────────────────

describe('exportApp', () => {
  it('returns an AppPackage with correct structure', async () => {
    const queryMock = makeQueryMock({
      'from public.apps': [makeAppRow()],
      'from platform.tables': [],
      'from platform.pages': [],
      'from platform.workflows': [],
      'from platform.scripts': [makeScriptRow()],
      'from platform.pdf_templates': [],
    });

    const db = { query: queryMock } as unknown as PoolClient;
    const pkg = await exportApp('acme', 'app-uuid-1', db);

    expect(pkg.app.id).toBe('app-uuid-1');
    expect(pkg.app.name).toBe('Test App');
    expect(pkg.scripts).toHaveLength(1);
    expect(pkg.scripts[0].name).toBe('GST Calculator');
    expect(pkg.tables).toHaveLength(0);
    expect(pkg.exportedAt).toBeTruthy();
    expect(pkg.version).toBeTruthy();
  });

  it('throws when app not found', async () => {
    const queryMock = makeQueryMock({ 'from public.apps': [] });
    const db = { query: queryMock } as unknown as PoolClient;
    await expect(exportApp('acme', 'missing', db)).rejects.toThrow('not found');
  });
});

// ─── importApp tests ──────────────────────────────────────────────────────────

describe('importApp', () => {
  function makePkg(): AppPackage {
    return {
      version: '2024.1.1',
      exportedAt: new Date().toISOString(),
      app: {
        id: 'old-app-id',
        tenantId: 'source',
        name: 'Imported App',
        slug: 'old-app-id',
        version: '1.0.0',
        status: 'draft',
        tables: [],
        pageIds: [],
        workflowIds: [],
        scriptIds: ['script-1'],
        connectorIds: [],
        docTemplateIds: [],
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tables: [],
      pages: [],
      workflows: [],
      scripts: [
        {
          id: 'script-1',
          appId: 'old-app-id',
          name: 'Script A',
          language: 'javascript',
          code: 'export default async function run() {}',
          version: 1,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      ],
      templates: [],
    };
  }

  it('imports an app and returns a new appId', async () => {
    const queries: string[] = [];
    const db = {
      query: async (sql: string, _params?: unknown[]) => {
        queries.push(sql);
        // simulate no existing app
        if (sql.includes('FROM public.apps')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: 'new-uuid' }], rowCount: 1 };
      },
    } as unknown as PoolClient;

    const result = await importApp('target', makePkg(), { overwrite: false }, db);
    expect(typeof result.appId).toBe('string');
    expect(result.appId).not.toBe('old-app-id');
    expect(result.warnings).toHaveLength(0);
  });

  it('throws when app exists and overwrite is false', async () => {
    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM public.apps')) {
          return { rows: [{ id: 'existing-id' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as PoolClient;

    await expect(
      importApp('target', makePkg(), { overwrite: false }, db),
    ).rejects.toThrow('already exists');
  });

  it('warns about secrets.get usage', async () => {
    const pkg = makePkg();
    pkg.scripts[0].code = `
      export default async function run() {
        const key = secrets.get('API_KEY');
        return key;
      }
    `;

    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM public.apps')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: 'new-uuid' }], rowCount: 1 };
      },
    } as unknown as PoolClient;

    const result = await importApp('target', pkg, { overwrite: false }, db);
    expect(result.warnings.some(w => w.includes('secrets.get'))).toBe(true);
  });

  it('uses newAppName when provided', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        if (sql.includes('FROM public.apps')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: 'new-uuid' }], rowCount: 1 };
      },
    } as unknown as PoolClient;

    await importApp('target', makePkg(), { overwrite: false, newAppName: 'Renamed App' }, db);
    const insertCall = queries.find(q => q.sql.includes('INSERT INTO public.apps'));
    expect(insertCall?.params).toContain('Renamed App');
  });

  it('round-trips export then import', async () => {
    // Export
    const exportDb = {
      query: async (sql: string) => {
        if (sql.includes('FROM public.apps')) return { rows: [makeAppRow()], rowCount: 1 };
        if (sql.includes('FROM platform.scripts')) return { rows: [makeScriptRow()], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as PoolClient;

    const pkg = await exportApp('acme', 'app-uuid-1', exportDb);
    expect(pkg.scripts).toHaveLength(1);

    // Import
    const importQueries: string[] = [];
    const importDb = {
      query: async (sql: string) => {
        importQueries.push(sql);
        if (sql.includes('FROM public.apps')) return { rows: [], rowCount: 0 };
        return { rows: [{ id: 'new-uuid' }], rowCount: 1 };
      },
    } as unknown as PoolClient;

    const result = await importApp('target', pkg, { overwrite: false }, importDb);
    expect(typeof result.appId).toBe('string');
    // Script should be inserted
    expect(importQueries.some(q => q.includes('platform.scripts'))).toBe(true);
  });
});

// ─── versioning tests ─────────────────────────────────────────────────────────

describe('createAppVersion', () => {
  it('calls exportApp and inserts a version row', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        if (sql.includes('FROM public.apps')) return { rows: [makeAppRow()], rowCount: 1 };
        if (sql.includes('platform.app_versions') && sql.includes('INSERT')) {
          return { rows: [{ id: 'version-uuid' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as PoolClient;

    const versionId = await createAppVersion('acme', 'app-uuid-1', 'published', db, 'user-1');
    expect(versionId).toBe('version-uuid');

    const insertCall = queries.find(q => q.sql.includes('INSERT INTO platform.app_versions'));
    expect(insertCall).toBeTruthy();
    expect(insertCall?.params).toContain('published');
    expect(insertCall?.params).toContain('user-1');
  });
});

describe('listAppVersions', () => {
  it('returns versions ordered by created_at DESC', async () => {
    const db = {
      query: async () => ({
        rows: [
          { id: 'v2', tenant_slug: 'acme', app_id: 'app-uuid-1', label: 'published', created_by: null, created_at: new Date('2024-02-01') },
          { id: 'v1', tenant_slug: 'acme', app_id: 'app-uuid-1', label: 'draft', created_by: 'user-1', created_at: new Date('2024-01-01') },
        ],
        rowCount: 2,
      }),
    } as unknown as PoolClient;

    const versions = await listAppVersions('acme', 'app-uuid-1', db);
    expect(versions).toHaveLength(2);
    expect(versions[0].label).toBe('published');
    expect(versions[1].label).toBe('draft');
  });
});

describe('rollbackToVersion', () => {
  it('restores snapshot from a version', async () => {
    const pkg: AppPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: {
        id: 'app-uuid-1',
        tenantId: 'acme',
        name: 'Test App',
        slug: 'app-uuid-1',
        version: '1.0.0',
        status: 'published',
        tables: [],
        pageIds: [],
        workflowIds: [],
        scriptIds: [],
        connectorIds: [],
        docTemplateIds: [],
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tables: [],
      pages: [],
      workflows: [],
      scripts: [],
      templates: [],
    };

    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM platform.app_versions') && sql.includes('WHERE id')) {
          return { rows: [{ snapshot: pkg, tenant_slug: 'acme' }], rowCount: 1 };
        }
        // For pre-rollback snapshot creation
        if (sql.includes('FROM public.apps')) return { rows: [makeAppRow()], rowCount: 1 };
        if (sql.includes('INSERT INTO platform.app_versions')) return { rows: [{ id: 'pre-v' }], rowCount: 1 };
        // For overwrite check in importApp
        if (sql.includes('SELECT id FROM public.apps')) return { rows: [{ id: 'app-uuid-1' }], rowCount: 1 };
        return { rows: [{ id: 'new-id' }], rowCount: 1 };
      },
    } as unknown as PoolClient;

    const result = await rollbackToVersion('acme', 'app-uuid-1', 'v1', db);
    expect(typeof result.appId).toBe('string');
  });

  it('throws if the version belongs to a different app', async () => {
    const pkg: AppPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: {
        id: 'different-app',
        tenantId: 'acme',
        name: 'Other App',
        slug: 'different-app',
        version: '1.0.0',
        status: 'draft',
        tables: [],
        pageIds: [],
        workflowIds: [],
        scriptIds: [],
        connectorIds: [],
        docTemplateIds: [],
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tables: [],
      pages: [],
      workflows: [],
      scripts: [],
      templates: [],
    };

    const db = {
      query: async () => ({ rows: [{ snapshot: pkg, tenant_slug: 'acme' }], rowCount: 1 }),
    } as unknown as PoolClient;

    await expect(
      rollbackToVersion('acme', 'app-uuid-1', 'v1', db),
    ).rejects.toThrow('belongs to app');
  });
});
