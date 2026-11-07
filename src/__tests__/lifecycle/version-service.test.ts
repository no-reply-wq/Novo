/**
 * Tests for the lifecycle version service.
 */

jest.mock('../../platform/lifecycle/bundle-assembler', () => ({
  assembleBundle: jest.fn().mockResolvedValue({
    schemaVersion: '1.0',
    exportedAt: '2024-11-07T00:00:00.000Z',
    app: { id: 'app1', name: 'Test App' },
    schema: { tables: [], relations: [], childTableConfigs: [] },
    ui: { pages: [], navItems: [] },
    logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
    scripts: [],
    integrations: { pdfTemplates: [], emailTemplates: [], stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
  }),
}));

import { createVersion, listVersions, publishVersion, rollbackVersion } from '../../platform/lifecycle/version-service';

function makeVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1', app_id: 'app1', version_number: 1, label: 'Initial', status: 'draft',
    bundle: { schemaVersion: '1.0', exportedAt: '', app: { id: 'app1', name: 'Test App' }, schema: { tables: [], relations: [], childTableConfigs: [] }, ui: { pages: [], navItems: [] }, logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] }, scripts: [], integrations: {} },
    created_at: new Date('2024-11-07'), created_by: 'user1', published_at: null, rollback_from: null,
    ...overrides,
  };
}

function makeClient(queryResults: Array<{ rowCount: number; rows: unknown[] }>) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rowCount: 0, rows: [] };
      callIndex++;
      return Promise.resolve(result);
    }),
  };
}

describe('createVersion', () => {
  it('creates a draft version with auto-incremented versionNumber', async () => {
    const client = makeClient([
      { rowCount: 1, rows: [{ next_num: 3 }] },
      { rowCount: 1, rows: [makeVersionRow({ version_number: 3, label: 'v3' })] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const version = await createVersion('app1', 'v3', 'user1', client as any);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(version.versionNumber).toBe(3);
    expect(version.status).toBe('draft');
    expect(version.createdBy).toBe('user1');
  });

  it('uses versionNumber=1 for first version', async () => {
    const client = makeClient([
      { rowCount: 1, rows: [{ next_num: 1 }] },
      { rowCount: 1, rows: [makeVersionRow({ version_number: 1 })] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const version = await createVersion('app1', undefined, 'user1', client as any);
    expect(version.versionNumber).toBe(1);
  });
});

describe('listVersions', () => {
  it('returns versions ordered by version_number DESC', async () => {
    const client = makeClient([
      { rowCount: 2, rows: [makeVersionRow({ id: 'v2', version_number: 2 }), makeVersionRow({ id: 'v1', version_number: 1 })] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const versions = await listVersions('app1', client as any);
    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(2);
    expect(versions[1].versionNumber).toBe(1);
  });
});

describe('publishVersion', () => {
  it('publishes a version and updates the environment pointer', async () => {
    const client = makeClient([
      { rowCount: 1, rows: [makeVersionRow({ status: 'draft' })] },
      { rowCount: 1, rows: [{ current_version_id: null }] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(publishVersion('v1', 'production', 'user1', client as any)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledTimes(4);
  });

  it('throws for archived versions', async () => {
    const client = makeClient([{ rowCount: 1, rows: [makeVersionRow({ status: 'archived' })] }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(publishVersion('v1', 'production', 'user1', client as any)).rejects.toThrow('archived');
  });
});

describe('rollbackVersion', () => {
  it('updates environment pointer to target version', async () => {
    const client = makeClient([
      { rowCount: 1, rows: [{ id: 'v2' }] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(rollbackVersion('app1', 'v2', 'production', 'user1', client as any)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('throws if target version not found', async () => {
    const client = makeClient([{ rowCount: 0, rows: [] }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(rollbackVersion('app1', 'nonexistent', 'production', 'user1', client as any)).rejects.toThrow('not found');
  });
});
