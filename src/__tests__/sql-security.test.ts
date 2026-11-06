/**
 * Security tests for src/lib/db/sql.ts
 * Verifies that SQL injection is prevented via the ident() sanitizer.
 */
import { ident, assertTable, assertColumn, clampInt, ALLOWED_SORT_DIRS, ALLOWED_AGGREGATES } from '@/lib/db/sql';

describe('ident() — SQL identifier sanitizer', () => {
  describe('valid identifiers are accepted and double-quoted', () => {
    const valid: [string, string][] = [
      ['simple', '"simple"'],
      ['table_name', '"table_name"'],
      ['ct_customers', '"ct_customers"'],
      ['field123', '"field123"'],
      ['a', '"a"'],
      ['a1', '"a1"'],
      ['created_at', '"created_at"'],
      ['tenant_abc123', '"tenant_abc123"'],
    ];
    test.each(valid)('ident(%s) → %s', (input, expected) => {
      expect(ident(input)).toBe(expected);
    });
  });

  describe('SQL injection attacks are rejected', () => {
    const attacks: string[] = [
      "users; DROP TABLE tenants; --",
      '" OR 1=1 --',
      "' OR '1'='1",
      '../secret',
      '1; SELECT * FROM pg_user',
      "name'; DELETE FROM users; --",
      'UNION SELECT * FROM users',
      'table--comment',
      'field LIKE %x%',
      '; COPY users TO STDOUT',
      'x\0y',
      '',
      ' ',
      'name space',
      'col()',
      'col/*injection*/',
      "col'",
      'col"',
      '\'; TRUNCATE TABLE users; --',
    ];
    test.each(attacks)('rejects attack: %j', (attack) => {
      expect(() => ident(attack)).toThrow('Invalid SQL identifier');
    });
  });

  describe('identifiers starting with a digit are rejected', () => {
    const invalid = ['1invalid', '0abc', '9table'];
    test.each(invalid)('rejects: %s', (val) => {
      expect(() => ident(val)).toThrow();
    });
  });

  it('rejects uppercase identifiers', () => {
    expect(() => ident('TableName')).toThrow();
    expect(() => ident('USERS')).toThrow();
    expect(() => ident('Id')).toThrow();
  });

  it('rejects non-string inputs', () => {
    expect(() => ident(null)).toThrow();
    expect(() => ident(undefined)).toThrow();
    expect(() => ident(42)).toThrow();
    expect(() => ident({ toString: () => 'valid' })).toThrow();
  });

  it('rejects identifiers longer than 63 characters', () => {
    const tooLong = 'a' + 'b'.repeat(63); // 64 chars
    expect(() => ident(tooLong)).toThrow();
  });

  it('accepts exactly 63-character identifier', () => {
    const maxLen = 'a' + 'b'.repeat(62); // 63 chars
    expect(ident(maxLen)).toBe(`"${maxLen}"`);
  });
});

describe('assertTable()', () => {
  const allowed = new Set(['customers', 'orders', 'products']);

  it('allows tables in the allowed set', () => {
    expect(assertTable('customers', allowed)).toBe('"customers"');
  });

  it('rejects tables not in allowed set', () => {
    expect(() => assertTable('pg_user', allowed)).toThrow('Table not allowed');
  });

  it('rejects SQL injection even if format looks valid', () => {
    expect(() => assertTable('users', allowed)).toThrow('Table not allowed');
  });
});

describe('assertColumn()', () => {
  const allowed = new Set(['name', 'email', 'created_at']);

  it('allows columns in the allowed set', () => {
    expect(assertColumn('name', allowed)).toBe('"name"');
  });

  it('rejects columns not in allowed set', () => {
    expect(() => assertColumn('password_hash', allowed)).toThrow('Column not allowed');
  });
});

describe('clampInt()', () => {
  it('returns the value when in range', () => {
    expect(clampInt(5, 1, 100)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clampInt(-10, 1, 100)).toBe(1);
    expect(clampInt(0, 1, 100)).toBe(1);
  });

  it('clamps to max', () => {
    expect(clampInt(9999, 1, 100)).toBe(100);
    expect(clampInt(101, 1, 100)).toBe(100);
  });

  it('returns defaultValue for non-integer', () => {
    expect(clampInt('abc', 1, 100, 10)).toBe(10);
    expect(clampInt(NaN, 1, 100, 5)).toBe(5);
  });

  it('prevents injection via string parsing', () => {
    // "1; DROP TABLE users" should not parse to 1
    expect(clampInt('1; DROP TABLE users', 1, 100, 1)).toBe(1);
  });
});

describe('ALLOWED_SORT_DIRS', () => {
  it('only allows asc and desc', () => {
    expect(ALLOWED_SORT_DIRS.has('asc')).toBe(true);
    expect(ALLOWED_SORT_DIRS.has('desc')).toBe(true);
  });

  it('rejects injection attempts', () => {
    expect(ALLOWED_SORT_DIRS.has('ASC')).toBe(false);
    expect(ALLOWED_SORT_DIRS.has('DESC')).toBe(false);
    expect(ALLOWED_SORT_DIRS.has('; DROP TABLE users')).toBe(false);
    expect(ALLOWED_SORT_DIRS.has('asc; DROP TABLE users')).toBe(false);
    expect(ALLOWED_SORT_DIRS.has('')).toBe(false);
  });
});

describe('ALLOWED_AGGREGATES', () => {
  it('allows valid SQL aggregate functions', () => {
    for (const agg of ['count', 'sum', 'avg', 'min', 'max']) {
      expect(ALLOWED_AGGREGATES.has(agg)).toBe(true);
    }
  });

  it('rejects uppercase and injections', () => {
    expect(ALLOWED_AGGREGATES.has('COUNT')).toBe(false);
    expect(ALLOWED_AGGREGATES.has('count(*); DROP TABLE users')).toBe(false);
    expect(ALLOWED_AGGREGATES.has('')).toBe(false);
  });
});
