/**
 * Tests for the validation engine.
 */

import { validateField, validateRecord } from '../validation';
import type { FieldDef, TableSchema } from '../types';
import type { PoolClient } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<FieldDef> & Pick<FieldDef, 'type'>): FieldDef {
  return {
    id: 'fld1',
    tableId: 'tbl1',
    name: 'Test Field',
    apiKey: 'test_field',
    rank: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTable(fields: FieldDef[]): TableSchema {
  return {
    id: 'tbl1',
    appId: 'app1',
    name: 'Test Table',
    apiKey: 'test_table',
    fields,
    relations: [],
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Mock DB that returns no duplicates
function makeNoopDb(): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as PoolClient;
}

// Mock DB that returns a duplicate
function makeDuplicateDb(): PoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'other-id' }], rowCount: 1 }),
  } as unknown as PoolClient;
}

// ─── validateField: required ──────────────────────────────────────────────────

describe('validateField - required', () => {
  it('passes when required=true and value present', () => {
    const field = makeField({ type: 'text', required: true });
    expect(validateField('hello', field, {})).toHaveLength(0);
  });

  it('fails when required=true and value blank', () => {
    const field = makeField({ type: 'text', required: true });
    const errors = validateField('', field, {});
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('required');
  });

  it('fails when required=true and value null', () => {
    const field = makeField({ type: 'text', required: true });
    expect(validateField(null, field, {})[0].code).toBe('required');
  });

  it('passes when required=false and value blank', () => {
    const field = makeField({ type: 'text', required: false });
    expect(validateField('', field, {})).toHaveLength(0);
  });

  it('evaluates expression-based required', () => {
    const field = makeField({
      type: 'text',
      // The expr engine uses double-quoted string literals
      required: 'type = "export"', // required only when type is export
    });
    // type = 'export' → required → blank → error
    expect(validateField('', field, { type: 'export' })[0].code).toBe('conditional_required');
    // type = 'local' → not required → blank → ok
    expect(validateField('', field, { type: 'local' })).toHaveLength(0);
  });
});

// ─── validateField: number min/max ───────────────────────────────────────────

describe('validateField - number min/max', () => {
  it('passes within range', () => {
    const field = makeField({ type: 'integer', options: { min: 1, max: 100 } });
    expect(validateField(50, field, {})).toHaveLength(0);
  });

  it('fails below min', () => {
    const field = makeField({ type: 'integer', options: { min: 10 } });
    expect(validateField(5, field, {})[0].code).toBe('min');
  });

  it('fails above max', () => {
    const field = makeField({ type: 'integer', options: { max: 100 } });
    expect(validateField(200, field, {})[0].code).toBe('max');
  });
});

// ─── validateField: email ─────────────────────────────────────────────────────

describe('validateField - email', () => {
  it('passes valid email', () => {
    const field = makeField({ type: 'email' });
    expect(validateField('user@example.com', field, {})).toHaveLength(0);
  });

  it('fails invalid email', () => {
    const field = makeField({ type: 'email' });
    expect(validateField('not-an-email', field, {})[0].code).toBe('pattern');
  });
});

// ─── validateField: url ───────────────────────────────────────────────────────

describe('validateField - url', () => {
  it('passes valid URL', () => {
    const field = makeField({ type: 'url' });
    expect(validateField('https://example.com', field, {})).toHaveLength(0);
  });

  it('fails invalid URL', () => {
    const field = makeField({ type: 'url' });
    expect(validateField('not a url', field, {})[0].code).toBe('pattern');
  });
});

// ─── validateField: custom validation rules ───────────────────────────────────

describe('validateField - custom rules', () => {
  it('passes when expression returns true', () => {
    const field = makeField({
      type: 'integer',
      validationRules: [{ expression: 'test_field > 0', message: 'Must be positive' }],
    });
    expect(validateField(5, field, { test_field: 5 })).toHaveLength(0);
  });

  it('fails when expression returns false', () => {
    const field = makeField({
      type: 'integer',
      validationRules: [{ expression: 'test_field > 0', message: 'Must be positive' }],
    });
    const errors = validateField(-1, field, { test_field: -1 });
    expect(errors[0].code).toBe('custom');
    expect(errors[0].message).toBe('Must be positive');
  });
});

// ─── validateRecord: unique ───────────────────────────────────────────────────

describe('validateRecord - unique', () => {
  it('passes when no duplicate', async () => {
    const field = makeField({ type: 'text', apiKey: 'email', name: 'Email', unique: true });
    const table = makeTable([field]);
    const db = makeNoopDb();
    const errors = await validateRecord({ email: 'a@b.com' }, table, db, 'test');
    expect(errors).toHaveLength(0);
  });

  it('fails when duplicate found', async () => {
    const field = makeField({ type: 'text', apiKey: 'email', name: 'Email', unique: true });
    const table = makeTable([field]);
    const db = makeDuplicateDb();
    const errors = await validateRecord({ email: 'a@b.com' }, table, db, 'test');
    expect(errors[0].code).toBe('unique');
  });
});

// ─── validateRecord: multiple fields ─────────────────────────────────────────

describe('validateRecord - multiple fields', () => {
  it('accumulates errors from multiple fields', async () => {
    const fields = [
      makeField({ id: 'f1', apiKey: 'name', name: 'Name', type: 'text', required: true }),
      makeField({ id: 'f2', apiKey: 'age', name: 'Age', type: 'integer', options: { min: 18 } }),
    ];
    const table = makeTable(fields);
    const db = makeNoopDb();
    const errors = await validateRecord({ name: '', age: 10 }, table, db, 'test');
    const codes = errors.map(e => e.code);
    expect(codes).toContain('required');
    expect(codes).toContain('min');
  });
});
