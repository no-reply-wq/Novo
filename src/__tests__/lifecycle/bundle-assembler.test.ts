/**
 * Tests for the lifecycle bundle assembler.
 */

import type { AppBundle } from '../../platform/lifecycle/types';

jest.mock('../../platform/packaging/exporter', () => ({
  exportApp: jest.fn(),
}));

import { exportApp as mockExportAppFn } from '../../platform/packaging/exporter';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExportApp = mockExportAppFn as jest.MockedFunction<any>;

import { assembleBundle } from '../../platform/lifecycle/bundle-assembler';

function makePkgBundle() {
  return {
    version: '2024.11.7',
    exportedAt: '2024-11-07T00:00:00.000Z',
    exportedBy: 'test-user',
    app: { name: 'Test App', slug: 'test-app', icon: 'box', description: 'A test app' },
    schema: {
      tables: [{ slug: 'orders', name: 'Orders', fields: [], indexes: [] }],
      relations: [],
      childTableConfigs: [],
    },
    ui: { pages: [{ id: 'pg1', slug: 'home' }], navItems: [] },
    logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
    scripts: [{ id: 's1', name: 'calc', code: 'return 1', inputSchema: [], outputSchema: [], testCases: [] }],
    integrations: {
      pdfTemplates: [], emailTemplates: [], stockConfigs: [],
      fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [],
    },
  };
}

function makeMockClient(tenantSlug = 'acme', color: string | null = '#ff0000') {
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      if ((sql as string).includes('tenant_slug') && !(sql as string).includes('color')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_slug: tenantSlug }] });
      }
      return Promise.resolve({ rowCount: 1, rows: [{ id: 'app1', color, slug: 'test-app' }] });
    }),
    release: jest.fn(),
  };
}

describe('assembleBundle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a bundle with schemaVersion 1.0', async () => {
    mockExportApp.mockResolvedValueOnce(makePkgBundle());
    const client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle = await assembleBundle('app1', client as any, 'acme', 'user1');
    expect(bundle.schemaVersion).toBe('1.0');
  });

  it('includes app.id in bundle', async () => {
    mockExportApp.mockResolvedValueOnce(makePkgBundle());
    const client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle = await assembleBundle('app-xyz', client as any, 'acme');
    expect(bundle.app.id).toBe('app-xyz');
  });

  it('includes app.color from DB row', async () => {
    mockExportApp.mockResolvedValueOnce(makePkgBundle());
    const client = makeMockClient('acme', '#3b82f6');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle = await assembleBundle('app1', client as any, 'acme');
    expect(bundle.app.color).toBe('#3b82f6');
  });

  it('includes all schema sections', async () => {
    mockExportApp.mockResolvedValueOnce(makePkgBundle());
    const client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle = await assembleBundle('app1', client as any, 'acme');
    expect(bundle.schema.tables).toHaveLength(1);
    expect(bundle.ui.pages).toHaveLength(1);
    expect(bundle.scripts).toHaveLength(1);
    expect(bundle.scripts[0].name).toBe('calc');
  });

  it('maps scripts with id, name, code, testCases', async () => {
    mockExportApp.mockResolvedValueOnce(makePkgBundle());
    const client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle: AppBundle = await assembleBundle('app1', client as any, 'acme');
    const script = bundle.scripts[0];
    expect(script).toHaveProperty('id');
    expect(script).toHaveProperty('name');
    expect(script).toHaveProperty('code');
    expect(script).toHaveProperty('testCases');
  });
});
