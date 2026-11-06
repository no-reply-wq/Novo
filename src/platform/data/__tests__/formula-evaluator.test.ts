/**
 * Tests for src/platform/data/formula-evaluator.ts
 *
 * Tests the data-layer formula evaluator, which wraps the expr engine.
 */

import {
  evaluateFormulaField,
  evaluateLineFormulaField,
  formulaToSql,
} from '../formula-evaluator';
import { NotConfiguredError } from '../errors';
import type { FormulaFieldOptions } from '@/platform/contracts';

function makeOpts(
  expression: string,
  returnType: FormulaFieldOptions['returnType'] = 'number',
): FormulaFieldOptions {
  return { expression, returnType };
}

// ─── evaluateFormulaField ─────────────────────────────────────────────────────

describe('evaluateFormulaField — arithmetic', () => {
  it('evaluates simple multiplication', () => {
    const result = evaluateFormulaField(makeOpts('qty * rate'), { qty: 5, rate: 100 });
    expect(result).toBe(500);
  });

  it('evaluates complex invoice formula: qty*rate*(1-disc/100)*(1+gst/100)', () => {
    const row = { qty: 10, rate: 100, disc: 10, gst: 18 };
    const result = evaluateFormulaField(
      makeOpts('qty * rate * (1 - disc / 100) * (1 + gst / 100)'),
      row,
    ) as number;
    expect(result).toBeCloseTo(1062, 0);
  });

  it('returns null on division by zero', () => {
    const result = evaluateFormulaField(makeOpts('10 / 0'), {});
    expect(result).toBeNull();
  });

  it('returns null on parse error (invalid expression)', () => {
    const result = evaluateFormulaField(makeOpts('!!!invalid***'), {});
    expect(result).toBeNull();
  });

  it('handles missing field (coerces to 0 or returns null)', () => {
    const result = evaluateFormulaField(makeOpts('qty * nonexistent'), { qty: 5 });
    expect(result === null || result === 0).toBe(true);
  });
});

describe('evaluateFormulaField — IF()', () => {
  it('evaluates IF true branch', () => {
    const row = { status: 'Active', value: 100 };
    const result = evaluateFormulaField(
      makeOpts('IF(status = "Active", value * 1.1, value)'),
      row,
    ) as number;
    expect(result).toBeCloseTo(110, 5);
  });

  it('evaluates IF false branch', () => {
    const row = { status: 'Inactive', value: 100 };
    const result = evaluateFormulaField(
      makeOpts('IF(status = "Active", value * 1.1, value)'),
      row,
    );
    expect(result).toBe(100);
  });
});

describe('evaluateFormulaField — ROUND()', () => {
  it('rounds to specified decimal places', () => {
    const row = { price: 1.2345 };
    const result = evaluateFormulaField(makeOpts('ROUND(price, 2)'), row);
    expect(result).toBeCloseTo(1.23, 5);
  });
});

describe('evaluateFormulaField — string concatenation', () => {
  it('concatenates strings with +', () => {
    const row = { first: 'John', last: 'Doe' };
    const result = evaluateFormulaField(
      makeOpts('first + " " + last', 'text'),
      row,
    );
    expect(result).toBe('John Doe');
  });
});

describe('evaluateFormulaField — TODAY() / date', () => {
  it('evaluates YEAR(NOW()) with injected now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const result = evaluateFormulaField(makeOpts('YEAR(NOW())', 'number'), {}, { now });
    expect(result).toBe(2026);
  });
});

describe('evaluateFormulaField — returnType coercion', () => {
  it('coerces number result to text when returnType=text', () => {
    const result = evaluateFormulaField(makeOpts('qty * rate', 'text'), { qty: 5, rate: 10 });
    expect(result).toBe('50');
  });

  it('coerces to boolean', () => {
    const result = evaluateFormulaField(makeOpts('qty > 0', 'boolean'), { qty: 5 });
    expect(result).toBe(true);
  });

  it('returns null for non-finite number coercion', () => {
    // 'text' cannot be parsed as number
    const result = evaluateFormulaField(makeOpts('"hello"', 'number'), {});
    expect(result).toBeNull();
  });
});

describe('evaluateFormulaField — NotConfiguredError', () => {
  it('throws NotConfiguredError when expression is empty', () => {
    expect(() => evaluateFormulaField(makeOpts(''), {})).toThrow(NotConfiguredError);
    expect(() => evaluateFormulaField(makeOpts('   '), {})).toThrow(NotConfiguredError);
  });
});

// ─── evaluateLineFormulaField ─────────────────────────────────────────────────

describe('evaluateLineFormulaField', () => {
  it('evaluates child row fields', () => {
    const childRow = { qty: 5, rate: 100 };
    const parentRow = { discount: 10 };
    const result = evaluateLineFormulaField(makeOpts('qty * rate'), childRow, parentRow);
    expect(result).toBe(500);
  });

  it('accesses parent row via parent.field', () => {
    const childRow = { qty: 5, rate: 100 };
    const parentRow = { discount: 20 };
    const result = evaluateLineFormulaField(
      makeOpts('qty * rate * (1 - parent.discount / 100)'),
      childRow,
      parentRow,
    ) as number;
    expect(result).toBeCloseTo(400, 1);
  });

  it('handles missing child field (returns null or 0)', () => {
    const childRow = { qty: 5 };
    const parentRow = {};
    const result = evaluateLineFormulaField(makeOpts('qty * missing_rate'), childRow, parentRow);
    expect(result === null || result === 0).toBe(true);
  });

  it('throws NotConfiguredError when expression is empty', () => {
    expect(() => evaluateLineFormulaField(makeOpts(''), {}, {})).toThrow(NotConfiguredError);
  });
});

// ─── formulaToSql ─────────────────────────────────────────────────────────────

describe('formulaToSql', () => {
  it('returns null or a string — does not throw', () => {
    const result = formulaToSql(makeOpts('qty * rate'), { qty: 'number', rate: 'number' });
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('returns null for empty expression', () => {
    const result = formulaToSql(makeOpts(''), {});
    expect(result).toBeNull();
  });
});
