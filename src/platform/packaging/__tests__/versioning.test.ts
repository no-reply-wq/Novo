/**
 * Tests for the Draft → Preview → Publish versioning lifecycle.
 * Uses mock PoolClient — no real database needed.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createVersion,
  promoteToPreview,
  publishVersion,
  rollbackVersion,
  listVersions,
  getVersion,
} from '../versioning';
import type { AppVersionRow } from '../types';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVersionRow(overrides: Partial<AppVersionRow> = {}): AppVersionRow {
  return {
    id: 'ver-1',
    app_id: 'app-1',
    version: '1.0.0',
    status: 'draft',
    bundle: {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: 'test',
      app: { name: 'Test', slug: 'test' },
      schema: { tables: [], relations: [], childTableConfigs: [] },
      ui: { pages: [], navItems: [] },
      logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
      scripts: [],
      integrations: { pdfTemplates: [], emailTemplates: [], stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
    },
    published_at: null,
    published_by: null,
    rollback_from: null,
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

// Mock exporter to avoid real DB calls in createVersion
vi.mock('../exporter', () => ({
  exportApp: vi.fn(async () => ({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedBy: 'system',
    app: { name: 'Test', slug: 'test' },
    schema: { tables: [], relations: [], childTableConfigs: [] },
    ui: { pages: [], navItems: [] },
    logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
    scripts: [],
    integrations: { pdfTemplates: [], emailTemplates: [], stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
  })),
}));

type QueryFn = (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount: number };

function makeClient(queryMap: Record<string, QueryFn> = {}): PoolClient {
  const fn = async (sql: string, params?: unknown[]) => {
    const lower = sql.toLowerCase();
    for (const [key, handler] of Object.entries(queryMap)) {
      if (lower.includes(key.toLowerCase())) {
        const r = handler(sql, params);
        return makeQueryResult(r.rows as QueryResultRow[]);
      }
    }
    return makeQueryResult([]);
  };
  const query = vi.fn(fn) as unknown as PoolClient['query'];
  return { query, release: vi.fn() } as unknown as PoolClient;
}

// ─── createVersion ────────────────────────────────────────────────────────────

describe('createVersion', () => {
  it('captures current app state and creates a draft version', async () => {
    const insertedRows: unknown[] = [];
    const client = makeClient({
      'insert into platform.app_versions': (_sql, params) => {
        insertedRows.push(params);
        const row = makeVersionRow({ id: 'new-ver' });
        return { rows: [row], rowCount: 1 };
      },
    });

    const version = await createVersion('app-1', 'acme', '1.0.0', client, 'user-1');

    expect(version.status).toBe('draft');
    expect(version.version).toBe('1.0.0');
    expect(insertedRows.length).toBe(1);
  });

  it('uses provided label as version string', async () => {
    const client = makeClient({
      'insert into platform.app_versions': () => ({
        rows: [makeVersionRow({ version: 'sprint-99' })],
        rowCount: 1,
      }),
    });

    const version = await createVersion('app-1', 'acme', 'sprint-99', client);
    expect(version.version).toBe('sprint-99');
  });
});

// ─── promoteToPreview ─────────────────────────────────────────────────────────

describe('promoteToPreview', () => {
  it('sets status to preview for a draft version', async () => {
    const updates: unknown[][] = [];
    const client = makeClient({
      'from platform.app_versions': (sql) => {
        if (sql.toLowerCase().includes('where id =')) {
          return { rows: [makeVersionRow({ id: 'ver-1', status: 'draft' })], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      'update platform.app_versions': (_sql, params) => {
        updates.push(params ?? []);
        return { rows: [], rowCount: 1 };
      },
    });

    await promoteToPreview('ver-1', 'app-1', client);

    expect(updates.length).toBeGreaterThan(0);
    // The UPDATE SQL sets status = 'preview'
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'preview'"),
      expect.arrayContaining(['ver-1', 'app-1']),
    );
  });

  it('throws if version is not a draft', async () => {
    const client = makeClient({
      'from platform.app_versions': () => ({
        rows: [makeVersionRow({ status: 'published' })],
        rowCount: 1,
      }),
    });

    await expect(promoteToPreview('ver-1', 'app-1', client)).rejects.toThrow('draft');
  });
});

// ─── publishVersion ───────────────────────────────────────────────────────────

describe('publishVersion', () => {
  it('sets status to published', async () => {
    const client = makeClient({
      'from platform.app_versions': (sql) => {
        if (sql.includes('WHERE id =') || sql.includes('where id =')) {
          return { rows: [makeVersionRow({ status: 'draft' })], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      'update platform.app_versions': () => ({ rows: [], rowCount: 1 }),
      'update platform.app_environments': () => ({ rows: [], rowCount: 1 }),
    });

    await publishVersion('ver-1', 'app-1', client, 'user-1');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'published'"),
      expect.arrayContaining(['ver-1', 'app-1']),
    );
  });

  it('archives the previously published version', async () => {
    let archiveCall: string | null = null;
    const client = makeClient({
      'from platform.app_versions': () => ({
        rows: [makeVersionRow({ status: 'draft' })],
        rowCount: 1,
      }),
      'update platform.app_versions': (sql) => {
        if (sql.toLowerCase().includes("status = 'archived'")) {
          archiveCall = sql;
        }
        return { rows: [], rowCount: 1 };
      },
      'update platform.app_environments': () => ({ rows: [], rowCount: 1 }),
    });

    await publishVersion('ver-1', 'app-1', client);

    expect(archiveCall).not.toBeNull();
  });

  it('is idempotent: does not error if already published', async () => {
    const client = makeClient({
      'from platform.app_versions': () => ({
        rows: [makeVersionRow({ status: 'published' })],
        rowCount: 1,
      }),
    });

    await expect(publishVersion('ver-1', 'app-1', client)).resolves.toBeUndefined();
  });

  it('throws if version is archived', async () => {
    const client = makeClient({
      'from platform.app_versions': () => ({
        rows: [makeVersionRow({ status: 'archived' })],
        rowCount: 1,
      }),
    });

    await expect(publishVersion('ver-1', 'app-1', client)).rejects.toThrow('archived');
  });
});

// ─── rollbackVersion ──────────────────────────────────────────────────────────

describe('rollbackVersion', () => {
  it('creates a new version from the target bundle', async () => {
    const client = makeClient({
      'from platform.app_versions': (sql) => {
        // getVersion for target
        if (sql.toLowerCase().includes('where id = $1')) {
          return { rows: [makeVersionRow({ id: 'old-ver', version: '0.9.0', status: 'archived' })], rowCount: 1 };
        }
        // currently published version lookup
        if (sql.toLowerCase().includes("status = 'published'")) {
          return { rows: [{ id: 'cur-ver' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      'insert into platform.app_versions': () => ({
        rows: [makeVersionRow({ id: 'rollback-ver', version: '0.9.0-rollback-1', status: 'published', rollback_from: 'cur-ver' })],
        rowCount: 1,
      }),
      'update platform.app_versions': () => ({ rows: [], rowCount: 1 }),
      'update platform.app_environments': () => ({ rows: [], rowCount: 1 }),
    });

    const newVersion = await rollbackVersion('app-1', 'old-ver', client, 'admin');

    expect(newVersion.id).toBe('rollback-ver');
    expect(newVersion.status).toBe('published');
  });

  it('records rollback_from on the new version', async () => {
    const client = makeClient({
      'from platform.app_versions': (sql) => {
        if (sql.toLowerCase().includes('where id = $1')) {
          return { rows: [makeVersionRow({ id: 'target-ver', status: 'archived' })], rowCount: 1 };
        }
        if (sql.toLowerCase().includes("status = 'published'")) {
          return { rows: [{ id: 'live-ver' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      'insert into platform.app_versions': () => ({
        rows: [makeVersionRow({ rollback_from: 'live-ver', status: 'published' })],
        rowCount: 1,
      }),
      'update platform.app_versions': () => ({ rows: [], rowCount: 1 }),
      'update platform.app_environments': () => ({ rows: [], rowCount: 1 }),
    });

    const result = await rollbackVersion('app-1', 'target-ver', client);

    expect(result.rollbackFrom).toBe('live-ver');
  });
});

// ─── listVersions ─────────────────────────────────────────────────────────────

describe('listVersions', () => {
  it('returns versions ordered newest first', async () => {
    const client = makeClient({
      'from platform.app_versions': () => ({
        rows: [
          makeVersionRow({ id: 'ver-3', version: '1.3.0', created_at: new Date('2024-03-01') }),
          makeVersionRow({ id: 'ver-2', version: '1.2.0', created_at: new Date('2024-02-01') }),
          makeVersionRow({ id: 'ver-1', version: '1.1.0', created_at: new Date('2024-01-01') }),
        ],
        rowCount: 3,
      }),
    });

    const versions = await listVersions('app-1', client);

    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe('1.3.0');
    expect(versions[2].version).toBe('1.1.0');
  });
});

// ─── getVersion ──────────────────────────────────────────────────────────────

describe('getVersion', () => {
  it('throws if version not found', async () => {
    const client = makeClient({
      'from platform.app_versions': () => ({ rows: [], rowCount: 0 }),
    });

    await expect(getVersion('missing-ver', 'app-1', client)).rejects.toThrow('not found');
  });
});
