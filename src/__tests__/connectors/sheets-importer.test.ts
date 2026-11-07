/**
 * Sheets importer tests — mock googleapis, test column detection.
 */

// Mock the google-sheets module before importing sheets-importer
jest.mock('../../platform/connectors/google-sheets', () => ({
  readSheet: jest.fn(),
}));

import { readSheet } from '../../platform/connectors/google-sheets';
import { importSheetToTable } from '../../platform/connectors/sheets-importer';
import type { GoogleSheetsConfig } from '../../platform/connectors/google-sheets';

const mockReadSheet = readSheet as jest.MockedFunction<typeof readSheet>;

const config: GoogleSheetsConfig = {
  serviceAccountJsonSecret: 'sa-json-secret',
};

const secretGetter = async (_name: string) => '{}';

function makeMockPool(queryFn = jest.fn().mockResolvedValue({ rows: [] })) {
  return { query: queryFn } as unknown as import('pg').Pool;
}

describe('importSheetToTable', () => {
  beforeEach(() => {
    mockReadSheet.mockReset();
  });

  it('detects numeric columns', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['product', 'price', 'qty'],
      rows: [
        { product: 'Widget', price: '9.99', qty: '100' },
        { product: 'Gadget', price: '24.99', qty: '50' },
      ],
    });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config,
      'sheet-id',
      'Sheet1',
      'products',
      'app-1',
      'tenant1',
      pgPool,
      secretGetter,
    );

    const priceCol = result.columnsDetected.find((c) => c.name === 'price');
    const qtyCol = result.columnsDetected.find((c) => c.name === 'qty');
    expect(priceCol?.detectedType).toBe('number');
    expect(qtyCol?.detectedType).toBe('number');
  });

  it('detects date columns', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['name', 'created_at'],
      rows: [
        { name: 'Alice', created_at: '2024-01-15' },
        { name: 'Bob', created_at: '2024-02-20' },
      ],
    });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config, 'sheet-id', 'Sheet1', 'users', 'app-1', 'tenant1', pgPool, secretGetter,
    );

    const dateCol = result.columnsDetected.find((c) => c.name === 'created_at');
    expect(dateCol?.detectedType).toBe('date');
  });

  it('detects text columns by default', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['name', 'city'],
      rows: [
        { name: 'Alice', city: 'London' },
        { name: 'Bob', city: 'Paris' },
      ],
    });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config, 'sheet-id', 'Sheet1', 'contacts', 'app-1', 'tenant1', pgPool, secretGetter,
    );

    const cityCol = result.columnsDetected.find((c) => c.name === 'city');
    expect(cityCol?.detectedType).toBe('text');
  });

  it('returns rowsImported count', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['name'],
      rows: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
    });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config, 'sheet-id', 'Sheet1', 'names', 'app-1', 'tenant1', pgPool, secretGetter,
    );

    expect(result.rowsImported).toBe(3);
  });

  it('returns empty result for empty sheet', async () => {
    mockReadSheet.mockResolvedValue({ headers: [], rows: [] });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config, 'sheet-id', 'Sheet1', 'empty', 'app-1', 'tenant1', pgPool, secretGetter,
    );

    expect(result.rowsImported).toBe(0);
    expect(result.columnsDetected).toHaveLength(0);
    expect(result.errors).toContain('Sheet is empty');
  });

  it('converts column names to api keys', async () => {
    mockReadSheet.mockResolvedValue({
      headers: ['Product Name', 'Unit Price $'],
      rows: [{ 'Product Name': 'Widget', 'Unit Price $': '10' }],
    });

    const pgPool = makeMockPool();
    const result = await importSheetToTable(
      config, 'sheet-id', 'Sheet1', 'prods', 'app-1', 'tenant1', pgPool, secretGetter,
    );

    expect(result.columnsDetected[0].apiKey).toBe('product_name');
    expect(result.columnsDetected[1].apiKey).toBe('unit_price');
  });
});
