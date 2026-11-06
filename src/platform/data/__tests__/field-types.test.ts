/**
 * Tests for src/platform/data/field-types.ts
 *
 * Covers validation, SQL type mapping, serialize/deserialize for all
 * five advanced computed field types.
 */

import {
  validateComputedFieldOptions,
  computedFieldSqlType,
  serializeFieldOptions,
  deserializeFieldOptions,
  COMPUTED_FIELD_TYPES,
  type ComputedFieldTypeName,
} from '../field-types';
import type { FormulaFieldOptions, RollupFieldOptions } from '@/platform/contracts';

// ─── COMPUTED_FIELD_TYPES set ─────────────────────────────────────────────────

describe('COMPUTED_FIELD_TYPES', () => {
  it('contains all five advanced types', () => {
    expect(COMPUTED_FIELD_TYPES.has('formula')).toBe(true);
    expect(COMPUTED_FIELD_TYPES.has('rollup')).toBe(true);
    expect(COMPUTED_FIELD_TYPES.has('lookup_value')).toBe(true);
    expect(COMPUTED_FIELD_TYPES.has('auto_number')).toBe(true);
    expect(COMPUTED_FIELD_TYPES.has('status_from_rules')).toBe(true);
  });
});

// ─── computedFieldSqlType ─────────────────────────────────────────────────────

describe('computedFieldSqlType', () => {
  it('returns null for virtual types (formula, rollup, lookup_value, status_from_rules)', () => {
    expect(computedFieldSqlType('formula')).toBeNull();
    expect(computedFieldSqlType('rollup')).toBeNull();
    expect(computedFieldSqlType('lookup_value')).toBeNull();
    expect(computedFieldSqlType('status_from_rules')).toBeNull();
  });

  it('returns TEXT for auto_number (physical column)', () => {
    expect(computedFieldSqlType('auto_number')).toBe('TEXT');
  });
});

// ─── validateComputedFieldOptions ────────────────────────────────────────────

describe('validateComputedFieldOptions — formula', () => {
  it('passes valid options', () => {
    const result = validateComputedFieldOptions('formula', {
      expression: 'qty * rate',
      returnType: 'number',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails missing expression', () => {
    const result = validateComputedFieldOptions('formula', { returnType: 'number' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /expression/.test(e))).toBe(true);
  });

  it('fails empty expression', () => {
    const result = validateComputedFieldOptions('formula', {
      expression: '   ',
      returnType: 'number',
    });
    expect(result.ok).toBe(false);
  });

  it('fails invalid returnType', () => {
    const result = validateComputedFieldOptions('formula', {
      expression: 'x + y',
      returnType: 'unknown',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /returnType/.test(e))).toBe(true);
  });

  it('fails missing returnType', () => {
    const result = validateComputedFieldOptions('formula', { expression: 'x + y' });
    expect(result.ok).toBe(false);
  });
});

describe('validateComputedFieldOptions — rollup', () => {
  it('passes valid options', () => {
    const result = validateComputedFieldOptions('rollup', {
      sourceRelationId: 'rel-1',
      sourceFieldId: 'amount',
      aggregation: 'sum',
    });
    expect(result.ok).toBe(true);
  });

  it('fails missing sourceRelationId', () => {
    const result = validateComputedFieldOptions('rollup', {
      sourceFieldId: 'amount',
      aggregation: 'sum',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /sourceRelationId/.test(e))).toBe(true);
  });

  it('fails invalid aggregation', () => {
    const result = validateComputedFieldOptions('rollup', {
      sourceRelationId: 'rel-1',
      sourceFieldId: 'amount',
      aggregation: 'product',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /aggregation/.test(e))).toBe(true);
  });

  it('allows all valid aggregations', () => {
    const aggs = ['sum', 'count', 'avg', 'min', 'max', 'count_distinct'] as const;
    for (const agg of aggs) {
      const result = validateComputedFieldOptions('rollup', {
        sourceRelationId: 'rel-1',
        sourceFieldId: 'amount',
        aggregation: agg,
      });
      expect(result.ok).toBe(true);
    }
  });
});

describe('validateComputedFieldOptions — lookup_value', () => {
  it('passes valid options', () => {
    const result = validateComputedFieldOptions('lookup_value', {
      relationId: 'fld-customer',
      sourceFieldId: 'name',
    });
    expect(result.ok).toBe(true);
  });

  it('fails missing relationId', () => {
    const result = validateComputedFieldOptions('lookup_value', { sourceFieldId: 'name' });
    expect(result.ok).toBe(false);
  });
});

describe('validateComputedFieldOptions — auto_number', () => {
  it('passes empty options (all optional)', () => {
    const result = validateComputedFieldOptions('auto_number', {});
    expect(result.ok).toBe(true);
  });

  it('passes valid padding', () => {
    const result = validateComputedFieldOptions('auto_number', { padding: 6 });
    expect(result.ok).toBe(true);
  });

  it('fails non-integer padding', () => {
    const result = validateComputedFieldOptions('auto_number', { padding: 2.5 });
    expect(result.ok).toBe(false);
  });

  it('fails out-of-range padding', () => {
    expect(validateComputedFieldOptions('auto_number', { padding: 0 }).ok).toBe(false);
    expect(validateComputedFieldOptions('auto_number', { padding: 25 }).ok).toBe(false);
  });

  it('fails invalid resetRule', () => {
    const result = validateComputedFieldOptions('auto_number', { resetRule: 'daily' });
    expect(result.ok).toBe(false);
  });

  it('allows all valid resetRules', () => {
    for (const rule of ['never', 'yearly', 'monthly']) {
      const result = validateComputedFieldOptions('auto_number', { resetRule: rule });
      expect(result.ok).toBe(true);
    }
  });
});

describe('validateComputedFieldOptions — status_from_rules', () => {
  it('passes valid options', () => {
    const result = validateComputedFieldOptions('status_from_rules', {
      rules: [
        { label: 'Active', condition: "status = 'active'", rank: 1 },
        { label: 'Closed', condition: "status = 'closed'", rank: 2 },
      ],
      defaultStatus: 'Unknown',
    });
    expect(result.ok).toBe(true);
  });

  it('fails missing defaultStatus', () => {
    const result = validateComputedFieldOptions('status_from_rules', {
      rules: [{ label: 'A', condition: 'x = 1', rank: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /defaultStatus/.test(e))).toBe(true);
  });

  it('fails non-array rules', () => {
    const result = validateComputedFieldOptions('status_from_rules', {
      rules: 'not an array',
      defaultStatus: 'Draft',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /rules/.test(e))).toBe(true);
  });

  it('fails rule missing label', () => {
    const result = validateComputedFieldOptions('status_from_rules', {
      rules: [{ condition: 'x = 1', rank: 1 }],
      defaultStatus: 'Draft',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /label/.test(e))).toBe(true);
  });

  it('fails rule missing condition', () => {
    const result = validateComputedFieldOptions('status_from_rules', {
      rules: [{ label: 'A', rank: 1 }],
      defaultStatus: 'Draft',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /condition/.test(e))).toBe(true);
  });
});

// ─── serializeFieldOptions ────────────────────────────────────────────────────

describe('serializeFieldOptions', () => {
  it('normalizes rule ranks for status_from_rules', () => {
    const opts = {
      rules: [
        { label: 'A', condition: 'x = 1' },  // missing rank
        { label: 'B', condition: 'x = 2' },
      ],
      defaultStatus: 'Z',
    };
    const serialized = serializeFieldOptions('status_from_rules', opts as never);
    const rules = (serialized as { rules: Array<{ rank: number }> }).rules;
    expect(typeof rules[0].rank).toBe('number');
    expect(typeof rules[1].rank).toBe('number');
  });

  it('passes through formula options unchanged', () => {
    const opts: FormulaFieldOptions = { expression: 'x + y', returnType: 'number' };
    const serialized = serializeFieldOptions('formula', opts);
    expect(serialized).toMatchObject({ expression: 'x + y', returnType: 'number' });
  });
});

// ─── deserializeFieldOptions ──────────────────────────────────────────────────

describe('deserializeFieldOptions', () => {
  it('deserializes valid formula options', () => {
    const raw = { expression: 'qty * rate', returnType: 'number' };
    const result = deserializeFieldOptions('formula', raw);
    expect((result as FormulaFieldOptions).expression).toBe('qty * rate');
  });

  it('throws on null input', () => {
    expect(() => deserializeFieldOptions('formula', null)).toThrow();
  });

  it('throws on invalid options (validation fails)', () => {
    expect(() =>
      deserializeFieldOptions('rollup', { sourceFieldId: 'x', aggregation: 'sum' }),
    ).toThrow(/sourceRelationId/);
  });

  it('deserializes valid rollup options', () => {
    const raw: RollupFieldOptions = {
      sourceRelationId: 'rel-1',
      sourceFieldId: 'amount',
      aggregation: 'sum',
    };
    const result = deserializeFieldOptions('rollup', raw);
    expect((result as RollupFieldOptions).aggregation).toBe('sum');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('validateComputedFieldOptions — edge cases', () => {
  it('fails on null options', () => {
    const types: ComputedFieldTypeName[] = [
      'formula', 'rollup', 'lookup_value', 'auto_number', 'status_from_rules',
    ];
    for (const t of types) {
      const result = validateComputedFieldOptions(t, null);
      expect(result.ok).toBe(false);
    }
  });

  it('fails on non-object options', () => {
    const result = validateComputedFieldOptions('formula', 'not an object');
    expect(result.ok).toBe(false);
  });
});
