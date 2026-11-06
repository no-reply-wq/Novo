/**
 * Tests for LineItemGridComponent utility functions.
 */
import { formatCurrency, computeTotals, nextCell } from '../LineItemGridComponent';
import type { Row } from '@/types/runtime';
import type { GridColumn } from '../LineItemGridComponent';

describe('formatCurrency', () => {
  it('formats basic values with ₹ prefix', () => {
    expect(formatCurrency(1000)).toBe('₹1,000.00');
  });

  it('formats lakh correctly', () => {
    expect(formatCurrency(100000)).toBe('₹1,00,000.00');
  });

  it('formats crore correctly', () => {
    expect(formatCurrency(10000000)).toBe('₹1,00,00,000.00');
  });

  it('formats ₹1,23,456.78', () => {
    expect(formatCurrency(123456.78)).toBe('₹1,23,456.78');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('handles negative values', () => {
    const result = formatCurrency(-5000);
    expect(result).toContain('₹');
    expect(result).toContain('5,000.00');
    expect(result.startsWith('-')).toBe(true);
  });

  it('handles small values under 1000', () => {
    expect(formatCurrency(500)).toBe('₹500.00');
    expect(formatCurrency(99.99)).toBe('₹99.99');
  });
});

describe('computeTotals', () => {
  const columns: GridColumn[] = [
    { field: 'name', header: 'Name', type: 'text' },
    { field: 'qty', header: 'Qty', type: 'number' },
    { field: 'price', header: 'Price', type: 'currency' },
    { field: 'sku', header: 'SKU', type: 'text' },
  ];

  const rows: Row[] = [
    { id: '1', name: 'Item A', qty: 2, price: 100.5 },
    { id: '2', name: 'Item B', qty: 5, price: 200 },
    { id: '3', name: 'Item C', qty: 1, price: 50.25 },
  ];

  it('sums numeric columns', () => {
    const totals = computeTotals(rows, columns);
    expect(totals['qty']).toBe(8);
    expect(totals['price']).toBeCloseTo(350.75);
  });

  it('does not include text columns', () => {
    const totals = computeTotals(rows, columns);
    expect(totals['name']).toBeUndefined();
    expect(totals['sku']).toBeUndefined();
  });

  it('returns 0 totals for empty rows', () => {
    const totals = computeTotals([], columns);
    expect(totals['qty']).toBe(0);
    expect(totals['price']).toBe(0);
  });

  it('handles missing/null values as 0', () => {
    const r: Row[] = [
      { id: '1', qty: null, price: undefined },
    ];
    const totals = computeTotals(r, columns);
    expect(totals['qty']).toBe(0);
    expect(totals['price']).toBe(0);
  });
});

describe('nextCell', () => {
  it('advances to next column in same row', () => {
    expect(nextCell(0, 0, 3, 4)).toEqual({ row: 0, col: 1 });
  });

  it('wraps to first column of next row at end of columns', () => {
    expect(nextCell(0, 3, 3, 4)).toEqual({ row: 1, col: 0 });
  });

  it('stays at last cell when at end', () => {
    expect(nextCell(2, 3, 3, 4)).toEqual({ row: 2, col: 3 });
  });

  it('handles single-column grid', () => {
    expect(nextCell(0, 0, 3, 1)).toEqual({ row: 1, col: 0 });
  });

  it('handles single-row grid', () => {
    expect(nextCell(0, 1, 1, 3)).toEqual({ row: 0, col: 2 });
  });
});
