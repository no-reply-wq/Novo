/**
 * Tests for the Sheets importer.
 * Mocks: reader, DB client.
 */

jest.mock('../reader', () => ({
  readSheet: jest.fn(),
  listSheets: jest.fn(),
}));

import { readSheet, listSheets } from '../reader';
import { importSpreadsheet } from '../importer';

const mockReadSheet = readSheet as jest.Mock;
const mockListSheets = listSheets as jest.Mock;

function makeDb(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    query: overrides['query'] ?? jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
  };
}

describe('importSpreadsheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('imports a single sheet when sheetName specified', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['Name', 'Email'],
      rows: [{ Name: 'Alice', Email: 'alice@test.com' }],
    });

    const db = makeDb();
    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid', sheetName: 'Customers' },
      db: db as never,
    });

    expect(mockListSheets).not.toHaveBeenCalled();
    expect(result.tablesCreated).toHaveLength(1);
    expect(result.tablesCreated[0].name).toBe('Customers');
    expect(result.tablesCreated[0].fields).toHaveLength(2);
  });

  it('lists sheets and imports all when no sheetName given', async () => {
    mockListSheets.mockResolvedValue(['Sheet1', 'Sheet2']);
    mockReadSheet.mockResolvedValue({ headers: ['ID'], rows: [] });

    const db = makeDb();
    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid' },
      db: db as never,
    });

    expect(mockListSheets).toHaveBeenCalled();
    expect(result.tablesCreated).toHaveLength(2);
  });

  it('warns and skips empty sheet', async () => {
    mockListSheets.mockResolvedValue(['EmptySheet']);
    mockReadSheet.mockResolvedValue({ headers: [], rows: [] });

    const db = makeDb();
    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid' },
      db: db as never,
    });

    expect(result.warnings.some((w) => w.includes('empty'))).toBe(true);
  });

  it('detects field types when detectTypes is not false', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['Order Date', 'Amount', 'Status'],
      rows: [
        { 'Order Date': '2024-01-01', Amount: '100', Status: 'Active' },
        { 'Order Date': '2024-01-02', Amount: '200', Status: 'Active' },
      ],
    });

    const db = makeDb();
    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid', sheetName: 'Orders', detectTypes: true },
      db: db as never,
    });

    const fields = result.tablesCreated[0].fields;
    expect(fields.find((f) => f.name === 'Order Date')?.type).toBe('date');
    expect(fields.find((f) => f.name === 'Amount')?.type).toBe('currency');
  });

  it('warns when table already exists', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['Name'],
      rows: [{ Name: 'Bob' }],
    });

    const db = makeDb({
      query: jest.fn().mockResolvedValue({ rows: [{ count: '1' }] }),
    });

    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid', sheetName: 'Customers' },
      db: db as never,
    });

    expect(result.warnings.some((w) => w.includes('already exists'))).toBe(true);
  });

  it('returns empty tablesCreated when spreadsheet has no sheets', async () => {
    mockListSheets.mockResolvedValue([]);

    const db = makeDb();
    const result = await importSpreadsheet({
      tenantSlug: 'tenant1',
      appId: 'app1',
      options: { spreadsheetId: 'sid' },
      db: db as never,
    });

    expect(result.tablesCreated).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('no sheets'))).toBe(true);
  });
});
