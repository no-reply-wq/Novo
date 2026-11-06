import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import type { AppBundle } from '../types';

vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));

const mockBundle: AppBundle = {
  bundleVersion: 1,
  exportedAt: new Date().toISOString(),
  appId: 'app-1',
  appName: 'Test App',
  appSlug: 'test-app',
  version: '2026.1.1',
  schema: { tables: [] },
  ui: { pages: [], navItems: [], theme: null },
  logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
  scripts: [],
  templates: { pdf: [], email: [] },
  integrations: { stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
};

vi.mock('../exporter', () => ({
  exportApp: vi.fn().mockResolvedValue(mockBundle),
}));

function makeVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-1',
    app_id: 'app-1',
    version: 'v1',
    status: 'draft',
    bundle: mockBundle,
    published_at: null,
    published_by: null,
    rollback_from: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('createVersion', () => {
  it('creates with draft status', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { createVersion } = await import('../versioning');
    const row = makeVersionRow({ status: 'draft', version: 'my-label' });
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const v = await createVersion('app-1', 'tenant', 'my-label', fakeClient, 'user1');
    expect(v.status).toBe('draft');
    expect(v.version).toBe('my-label');
  });
});

describe('promoteToPreview', () => {
  it('sets status to preview', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { promoteToPreview } = await import('../versioning');
    const draftRow = makeVersionRow({ status: 'draft' });
    const previewRow = makeVersionRow({ status: 'preview' });
    const fakeClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [draftRow], rowCount: 1 }) // getVersion
        .mockResolvedValueOnce({ rows: [previewRow], rowCount: 1 }), // UPDATE
      release: vi.fn(),
    } as unknown as PoolClient;
    const v = await promoteToPreview('ver-1', 'app-1', fakeClient);
    expect(v.status).toBe('preview');
  });

  it('throws if not draft', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { promoteToPreview } = await import('../versioning');
    const publishedRow = makeVersionRow({ status: 'published' });
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [publishedRow], rowCount: 1 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    await expect(promoteToPreview('ver-1', 'app-1', fakeClient)).rejects.toThrow('draft');
  });
});

describe('publishVersion', () => {
  it('sets status to published', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { publishVersion } = await import('../versioning');
    const previewRow = makeVersionRow({ status: 'preview' });
    const publishedRow = makeVersionRow({ status: 'published', published_at: new Date().toISOString() });
    const fakeClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [previewRow], rowCount: 1 }) // getVersion
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // archive old
        .mockResolvedValueOnce({ rows: [publishedRow], rowCount: 1 }) // UPDATE published
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // updateEnvironmentVersion
      release: vi.fn(),
    } as unknown as PoolClient;
    const v = await publishVersion('ver-1', 'app-1', fakeClient, 'user1');
    expect(v.status).toBe('published');
  });

  it('is idempotent if already published', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { publishVersion } = await import('../versioning');
    const publishedRow = makeVersionRow({ status: 'published' });
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [publishedRow], rowCount: 1 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const v = await publishVersion('ver-1', 'app-1', fakeClient);
    expect(v.status).toBe('published');
  });

  it('throws if archived', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { publishVersion } = await import('../versioning');
    const archivedRow = makeVersionRow({ status: 'archived' });
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [archivedRow], rowCount: 1 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    await expect(publishVersion('ver-1', 'app-1', fakeClient)).rejects.toThrow('archived');
  });
});

describe('rollbackVersion', () => {
  it('creates new version with rollbackFrom set', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { rollbackVersion } = await import('../versioning');
    const targetRow = makeVersionRow({ id: 'ver-target', status: 'archived' });
    const newRow = makeVersionRow({ id: 'ver-new', status: 'published', rollback_from: 'ver-target' });
    const fakeClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [targetRow], rowCount: 1 }) // getVersion
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // archive current
        .mockResolvedValueOnce({ rows: [newRow], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // updateEnvironmentVersion
      release: vi.fn(),
    } as unknown as PoolClient;
    const v = await rollbackVersion('app-1', 'ver-target', fakeClient, 'user1');
    expect(v.id).toBe('ver-new');
    expect(v.rollbackFrom).toBe('ver-target');
  });
});

describe('listVersions', () => {
  it('returns versions newest first', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { listVersions } = await import('../versioning');
    const rows = [
      makeVersionRow({ id: 'v3', version: 'v3' }),
      makeVersionRow({ id: 'v2', version: 'v2' }),
      makeVersionRow({ id: 'v1', version: 'v1' }),
    ];
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows, rowCount: 3 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const versions = await listVersions('app-1', fakeClient);
    expect(versions).toHaveLength(3);
    expect(versions[0].id).toBe('v3');
  });
});

describe('getVersion', () => {
  it('throws if not found', async () => {
    vi.resetModules();
    vi.mock('@/lib/db/client', () => ({ pgPool: { connect: vi.fn() } }));
    vi.mock('../exporter', () => ({ exportApp: vi.fn().mockResolvedValue(mockBundle) }));
    const { getVersion } = await import('../versioning');
    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    } as unknown as PoolClient;
    await expect(getVersion('missing-id', 'app-1', fakeClient)).rejects.toThrow('not found');
  });
});
