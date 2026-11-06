/**
 * Tests for the CSV importer.
 */

import { jest } from '@jest/globals';

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const mockQuery = jest.fn<() => Promise<{ rows: unknown[]; rowCount: number }>>()
  .mockResolvedValue({ rows: [], rowCount: 1 });

jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ─── Mock type-detector ───────────────────────────────────────────────────────

jest.mock('../type-detector', () => ({
  detectFieldType: jest.fn<(name: string, samples: string[]) => { type: string }>().mockImplementation(
    (_name, samples) => {
      if (samples.every((s) => /^\d+(\.\d+)?$/.test(s.trim()))) return { type: 'integer' };
      if (samples.every((s) => /^\d{4}-\d{2}-\d{2}/.test(s.trim()))) return { type: 'date' };
      if (samples.every((s) => ['true', 'false', 'yes', 'no'].includes(s.toLowerCase()))) return { type: 'checkbox' };
      return { type: 'text' };
    }
  ),
}));

import { importFromCSV, parseCsv } from '../csv-importer';

// ─── parseCsv unit tests ──────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses a simple CSV with header row', () => {
    const csv = 'Name,Age,City\nAlice,30,London\nBob,25,Paris';
    const result = parseCsv(csv);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(['Name', 'Age', 'City']);
    expect(result[1]).toEqual(['Alice', '30', 'London']);
    expect(result[2]).toEqual(['Bob', '25', 'Paris']);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = '"Last, First",Age\n"Smith, John",42';
    const result = parseCsv(csv);
    expect(result[0]).toEqual(['Last, First', 'Age']);
    expect(result[1]).toEqual(['Smith, John', '42']);
  });

  it('handles CRLF line endings', () => {
    const csv = 'A,B\r\n1,2\r\n3,4';
    const result = parseCsv(csv);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual(['1', '2']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const csv = '"He said ""Hello""",ok';
    const result = parseCsv(csv);
    expect(result[0][0]).toBe('He said "Hello"');
  });

  it('trims whitespace from unquoted fields', () => {
    const csv = 'A , B , C\n 1 , 2 , 3 ';
    const result = parseCsv(csv);
    expect(result[1]).toEqual(['1', '2', '3']);
  });
});

// ─── importFromCSV integration tests ─────────────────────────────────────────

const TENANT = 'acme';
const TABLE_ID = 'products';

const BASE_CONFIG = {
  headerRow: 1,
  dataStartRow: 2,
  columnMappings: [
    { sheetColumn: 'A', fieldName: 'name', fieldType: 'text' as const },
    { sheetColumn: 'B', fieldName: 'price', fieldType: 'number' as const },
  ],
};

describe('importFromCSV', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('parses CSV with header row and imports data rows', async () => {
    const csv = 'Name,Price\nWidget,9.99\nGadget,19.99';
    const result = await importFromCSV(csv, BASE_CONFIG, TABLE_ID, TENANT);

    expect(result.totalRows).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('detects number column automatically when no fieldType given', async () => {
    const config = {
      headerRow: 1,
      dataStartRow: 2,
      columnMappings: [
        { sheetColumn: 'Amount', fieldName: 'amount' }, // no fieldType → auto-detect
      ],
    };
    const csv = 'Amount\n100\n200\n300';
    const result = await importFromCSV(csv, config, TABLE_ID, TENANT);

    expect(result.imported).toBe(3);
    // DB insert should have been called with numeric values
    const rawCalls = mockQuery.mock.calls as Array<[string, unknown[]]>;
    const values = rawCalls.map((c) => (c[1] as unknown[])[0]);
    expect(values).toEqual([100, 200, 300]);
  });

  it('detects date column automatically', async () => {
    const config = {
      headerRow: 1,
      dataStartRow: 2,
      columnMappings: [{ sheetColumn: 'Date', fieldName: 'created_date' }],
    };
    const csv = 'Date\n2024-01-15\n2024-02-20';
    const result = await importFromCSV(csv, config, TABLE_ID, TENANT);

    expect(result.imported).toBe(2);
    // Values inserted should be ISO date strings
    const rawCalls2 = mockQuery.mock.calls as Array<[string, unknown[]]>;
    const val = (rawCalls2[0][1] as unknown[])[0];
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('skips entirely empty rows', async () => {
    const csv = 'Name,Price\nWidget,9.99\n,,\nGadget,19.99';
    const result = await importFromCSV(csv, BASE_CONFIG, TABLE_ID, TENANT);

    expect(result.totalRows).toBe(3);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('records error for type mismatch (invalid number)', async () => {
    const csv = 'Name,Price\nWidget,NOT_A_NUMBER';
    const result = await importFromCSV(csv, BASE_CONFIG, TABLE_ID, TENANT);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].error).toContain('price');
  });

  it('returns correct counts when DB insert fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('unique_violation'));

    const csv = 'Name,Price\nWidget,9.99';
    const result = await importFromCSV(csv, BASE_CONFIG, TABLE_ID, TENANT);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].error).toContain('DB insert failed');
  });

  it('resolves column by header name when sheetColumn is not a letter', async () => {
    const config = {
      headerRow: 1,
      dataStartRow: 2,
      columnMappings: [
        { sheetColumn: 'Product Name', fieldName: 'name', fieldType: 'text' as const },
        { sheetColumn: 'Unit Price', fieldName: 'price', fieldType: 'number' as const },
      ],
    };
    const csv = 'Product Name,Unit Price\nAnvil,99';
    const result = await importFromCSV(csv, config, TABLE_ID, TENANT);

    expect(result.imported).toBe(1);
    const rawCalls3 = mockQuery.mock.calls as Array<[string, unknown[]]>;
    expect(rawCalls3[0][1]).toEqual(['Anvil', 99]);
  });

  it('reports correct totalRows count', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => `Item ${i},${i * 10}`).join('\n');
    const csv = `Name,Price\n${rows}`;
    const result = await importFromCSV(csv, BASE_CONFIG, TABLE_ID, TENANT);

    expect(result.totalRows).toBe(50);
    expect(result.imported).toBe(50);
  });
});
