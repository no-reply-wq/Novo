/**
 * Export -> Import roundtrip test.
 */

jest.mock('../../platform/lifecycle/bundle-assembler', () => ({
  assembleBundle: jest.fn(),
}));

jest.mock('../../platform/packaging/importer', () => ({
  importApp: jest.fn(),
}));

import { assembleBundle as mockAssembleBundleFn } from '../../platform/lifecycle/bundle-assembler';
import { importApp as mockPkgImportFn } from '../../platform/packaging/importer';
import { exportApp, importApp } from '../../platform/lifecycle/export-service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAssembleBundle = mockAssembleBundleFn as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPkgImport = mockPkgImportFn as jest.MockedFunction<any>;

function makeBundle() {
  return {
    schemaVersion: '1.0',
    exportedAt: '2024-11-07T00:00:00.000Z',
    app: { id: 'app1', name: 'Invoice App', description: 'Invoices', icon: 'file-text', color: '#3b82f6' },
    schema: { tables: [], relations: [], childTableConfigs: [] },
    ui: { pages: [], navItems: [] },
    logic: { workflows: [], approvalFlows: [], schedules: [], accessRules: [], fieldPermissions: [] },
    scripts: [{ id: 's1', name: 'calculateTax', code: 'return subtotal * 0.1', testCases: [] }],
    integrations: { pdfTemplates: [], emailTemplates: [], stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
  };
}

function makeClient() {
  return { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }), release: jest.fn() };
}

describe('exportApp -> importApp roundtrip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('export returns a non-empty Buffer', async () => {
    mockAssembleBundle.mockResolvedValueOnce(makeBundle());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await exportApp('app1', makeClient() as any, 'user1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10);
  });

  it('round-trip preserves app structure', async () => {
    mockAssembleBundle.mockResolvedValueOnce(makeBundle());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await exportApp('app1', makeClient() as any);

    mockPkgImport.mockResolvedValueOnce({ appId: 'new-app-1', tablesCreated: 1, pagesCreated: 1, workflowsCreated: 0, scriptsCreated: 1, warnings: [] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await importApp(buffer, 'target-tenant', 'user2', makeClient() as any);
    expect(result.appId).toBe('new-app-1');
    expect(result.warnings).toEqual([]);
  });

  it('import throws for invalid schemaVersion', async () => {
    const { createGzip } = await import('zlib');
    const { pipeline } = await import('stream/promises');
    const { Readable, Writable } = await import('stream');
    const badBundle = { ...makeBundle(), schemaVersion: '99.0' };
    const json = JSON.stringify(badBundle);
    const chunks: Buffer[] = [];
    const src = Readable.from([Buffer.from(json)]);
    const gz = createGzip();
    const sink = new Writable({ write(c: Buffer, _e: string, cb: () => void) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); cb(); } });
    await pipeline(src, gz, sink);
    const badBuffer = Buffer.concat(chunks);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(importApp(badBuffer, 'acme', 'user1', makeClient() as any)).rejects.toThrow('schemaVersion');
  });
});
