/**
 * Tests for the formula evaluator.
 */

import { evaluateFormula, evaluateLineFormula } from '../formula';
import type { TableSchema } from '../types';

// Minimal table schema for tests
const TABLE: TableSchema = {
  id: 'tbl1',
  appId: 'app1',
  name: 'Test Table',
  apiKey: 'test_table',
  fields: [],
  relations: [],
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('evaluateFormula', () => {
  it('evaluates simple arithmetic', () => {
    const row = { qty: 5, rate: 100 };
    expect(evaluateFormula('qty * rate', row, TABLE)).toBe(500);
  });

  it('evaluates string concatenation', () => {
    const row = { first: 'John', last: 'Doe' };
    // The expr engine uses double-quoted string literals
    expect(evaluateFormula('first + " " + last', row, TABLE)).toBe('John Doe');
  });

  it('evaluates IF expression', () => {
    const row = { status: 'Active', value: 100 };
    // The expr engine uses double-quoted string literals
    expect(evaluateFormula('IF(status = "Active", value * 1.1, value)', row, TABLE) as number).toBeCloseTo(110, 5);
    const row2 = { status: 'Inactive', value: 100 };
    expect(evaluateFormula('IF(status = "Active", value * 1.1, value)', row2, TABLE)).toBe(100);
  });

  it('evaluates discount formula', () => {
    const row = { qty: 10, rate: 100, disc: 10, gst: 18 };
    // qty*rate*(1-disc/100)*(1+gst/100)
    const result = evaluateFormula('qty * rate * (1 - disc / 100) * (1 + gst / 100)', row, TABLE);
    expect(typeof result).toBe('number');
    expect(result as number).toBeCloseTo(1062, 0);
  });

  it('handles unknown field (returns 0 or null for math ops)', () => {
    const row = { qty: 5 };
    // In the expr engine, missing fields resolve to null → coerced to 0 in arithmetic
    // The result is 0 (not null) because 5 * null→0 = 0
    const result = evaluateFormula('qty * nonexistent', row, TABLE);
    expect(result === null || result === 0).toBe(true);
  });

  it('returns null on division by zero (benign)', () => {
    const row = { a: 10, b: 0 };
    expect(evaluateFormula('a / b', row, TABLE)).toBeNull();
  });

  it('returns null on parse error', () => {
    const row = {};
    expect(evaluateFormula('!!!invalid***', row, TABLE)).toBeNull();
  });

  it('evaluates nested field access on array', () => {
    const row = {
      lines: [
        { qty: 2, rate: 50 },
        { qty: 3, rate: 50 },
      ],
    };
    // COUNT(lines) - should be 2
    const count = evaluateFormula('COUNT(lines)', row, TABLE);
    expect(count).toBe(2);
  });

  it('evaluates COALESCE', () => {
    const row = { a: null, b: 42 };
    expect(evaluateFormula('COALESCE(a, b)', row, TABLE)).toBe(42);
  });

  it('passes custom context (now)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const row = {};
    const result = evaluateFormula('YEAR(NOW())', row, TABLE, { now });
    expect(result).toBe(2026);
  });
});

describe('evaluateLineFormula', () => {
  it('evaluates child row fields', () => {
    const childRow = { qty: 5, rate: 100 };
    const parentRow = { discount: 10 };
    expect(evaluateLineFormula('qty * rate', childRow, parentRow)).toBe(500);
  });

  it('evaluates child row with parent reference', () => {
    const childRow = { qty: 5, rate: 100 };
    const parentRow = { discount: 20 };
    // qty * rate * (1 - parent.discount / 100)
    const result = evaluateLineFormula('qty * rate * (1 - parent.discount / 100)', childRow, parentRow);
    expect(result as number).toBeCloseTo(400, 0);
  });

  it('handles missing field in line formula (returns 0 or null)', () => {
    const childRow = { qty: 5 };
    const parentRow = {};
    // Missing field resolves to null → coerced to 0 in arithmetic
    const result = evaluateLineFormula('qty * missing_rate', childRow, parentRow);
    expect(result === null || result === 0).toBe(true);
  });
});
