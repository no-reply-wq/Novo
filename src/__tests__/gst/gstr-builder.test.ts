/**
 * Tests for GSTR-1 builder and CSV/JSON export
 */

import { exportGstr1ToJson, exportGstr1ToCsv } from '@/platform/gst/gstr-builder';
import type { Gstr1Report, GstrEntry } from '@/platform/gst/types';

function makeEntry(overrides: Partial<GstrEntry> = {}): GstrEntry {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-15',
    customerGstin: '27AABCU9603R1ZX',
    customerName: 'Test Customer',
    placeOfSupply: '27',
    taxableAmount: 10000,
    cgst: 900,
    sgst: 900,
    igst: 0,
    invoiceType: 'B2B',
    ...overrides,
  };
}

function makeReport(overrides: Partial<Gstr1Report> = {}): Gstr1Report {
  const b2b = [makeEntry({ invoiceType: 'B2B' })];
  const b2c = [makeEntry({ invoiceType: 'B2C', customerGstin: undefined, invoiceNumber: 'INV-002', cgst: 450, sgst: 450 })];
  const exports = [makeEntry({ invoiceType: 'export', customerGstin: undefined, invoiceNumber: 'INV-003', cgst: 0, sgst: 0, igst: 0 })];

  return {
    gstin: '27AABCU9603R1ZX',
    period: '01-2024',
    b2b,
    b2c,
    exports,
    totalTaxableValue: 30000,
    totalTax: 2700,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// B2B/B2C split
// ─────────────────────────────────────────────────────────────

describe('GSTR-1 report structure', () => {
  it('should have separate B2B, B2C and export buckets', () => {
    const report = makeReport();
    expect(report.b2b).toHaveLength(1);
    expect(report.b2c).toHaveLength(1);
    expect(report.exports).toHaveLength(1);
  });

  it('B2B entries should have customerGstin', () => {
    const report = makeReport();
    report.b2b.forEach((e) => expect(e.customerGstin).toBeTruthy());
  });

  it('B2C entries should not have customerGstin', () => {
    const report = makeReport();
    report.b2c.forEach((e) => expect(e.customerGstin).toBeUndefined());
  });

  it('export entries have zero tax', () => {
    const report = makeReport();
    report.exports.forEach((e) => {
      expect(e.cgst).toBe(0);
      expect(e.sgst).toBe(0);
      expect(e.igst).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Tax calculation logic (intra vs inter-state)
// ─────────────────────────────────────────────────────────────

describe('Tax classification', () => {
  it('intra-state B2B should have CGST + SGST', () => {
    const entry = makeEntry({ placeOfSupply: '27', cgst: 900, sgst: 900, igst: 0 });
    expect(entry.cgst).toBeGreaterThan(0);
    expect(entry.sgst).toBeGreaterThan(0);
    expect(entry.igst).toBe(0);
  });

  it('inter-state B2B should have IGST only', () => {
    const entry = makeEntry({ placeOfSupply: '29', cgst: 0, sgst: 0, igst: 1800 });
    expect(entry.igst).toBeGreaterThan(0);
    expect(entry.cgst).toBe(0);
    expect(entry.sgst).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// JSON export format
// ─────────────────────────────────────────────────────────────

describe('exportGstr1ToJson', () => {
  it('should produce valid JSON', () => {
    const report = makeReport();
    const json = exportGstr1ToJson(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should include gstin and fp fields', () => {
    const report = makeReport();
    const data = JSON.parse(exportGstr1ToJson(report));
    expect(data.gstin).toBe('27AABCU9603R1ZX');
    expect(data.fp).toBe('012024');
  });

  it('should have b2b array with invoice details', () => {
    const report = makeReport();
    const data = JSON.parse(exportGstr1ToJson(report));
    expect(Array.isArray(data.b2b)).toBe(true);
    expect(data.b2b[0].ctin).toBe('27AABCU9603R1ZX');
    expect(data.b2b[0].inv[0].inum).toBe('INV-001');
  });

  it('fp should be MMYYYY format', () => {
    const report = makeReport({ period: '03-2024' });
    const data = JSON.parse(exportGstr1ToJson(report));
    expect(data.fp).toBe('032024');
  });
});

// ─────────────────────────────────────────────────────────────
// CSV export format
// ─────────────────────────────────────────────────────────────

describe('exportGstr1ToCsv', () => {
  it('should produce CSV with header row', () => {
    const report = makeReport();
    const csv = exportGstr1ToCsv(report);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Invoice Number');
    expect(lines[0]).toContain('Taxable Amount');
  });

  it('should have one row per invoice (3 invoices = header + 3 rows)', () => {
    const report = makeReport();
    const lines = exportGstr1ToCsv(report).split('\n').filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3
  });

  it('CSV amounts should be formatted with 2 decimal places', () => {
    const report = makeReport();
    const lines = exportGstr1ToCsv(report).split('\n');
    expect(lines[1]).toContain('10000.00');
    expect(lines[1]).toContain('900.00');
  });

  it('invoiceType column should be present and correct', () => {
    const report = makeReport();
    const lines = exportGstr1ToCsv(report).split('\n');
    expect(lines[1]).toContain('B2B');
    expect(lines[2]).toContain('B2C');
    expect(lines[3]).toContain('export');
  });
});
