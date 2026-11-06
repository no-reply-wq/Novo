import { detectFieldType } from '../type-detector';

describe('detectFieldType', () => {
  // ── Column-name hints ───────────────────────────────────────────────────────

  it('detects currency for column containing "amount"', () => {
    expect(detectFieldType('Invoice Amount', ['100', '200'])).toEqual({ type: 'currency' });
  });

  it('detects currency for column containing "price"', () => {
    expect(detectFieldType('Unit Price', ['9.99', '14.99'])).toEqual({ type: 'currency' });
  });

  it('detects currency for column containing "cost"', () => {
    expect(detectFieldType('Total Cost', ['500'])).toEqual({ type: 'currency' });
  });

  it('detects integer for column containing "qty"', () => {
    expect(detectFieldType('Qty', ['10', '20', '5'])).toEqual({ type: 'integer' });
  });

  it('detects integer for column containing "count"', () => {
    expect(detectFieldType('Item Count', ['1', '2'])).toEqual({ type: 'integer' });
  });

  it('detects date for column ending with "date"', () => {
    expect(detectFieldType('Order Date', ['ABC', 'XYZ'])).toEqual({ type: 'date' });
  });

  it('detects date for column starting with "date"', () => {
    expect(detectFieldType('Date Created', ['foo'])).toEqual({ type: 'date' });
  });

  // ── Value-pattern matching ──────────────────────────────────────────────────

  it('detects date from ISO date values', () => {
    expect(detectFieldType('Issued', ['2024-01-15', '2024-02-20'])).toEqual({ type: 'date' });
  });

  it('detects email from email values', () => {
    expect(detectFieldType('Contact', ['a@b.com', 'x@y.org'])).toEqual({ type: 'email' });
  });

  it('detects phone from phone values', () => {
    expect(detectFieldType('Mobile', ['+91 9876543210', '9876543210'])).toEqual({ type: 'phone' });
  });

  it('detects integer from all-integer values', () => {
    expect(detectFieldType('Serial', ['1', '2', '100'])).toEqual({ type: 'integer' });
  });

  it('detects decimal from decimal values', () => {
    expect(detectFieldType('Weight', ['1.5', '2.0', '0.75'])).toEqual({ type: 'decimal' });
  });

  // ── Low-cardinality dropdown ────────────────────────────────────────────────

  it('detects dropdown for low-cardinality repeated values', () => {
    const values = ['Active', 'Inactive', 'Active', 'Pending', 'Active', 'Inactive'];
    const result = detectFieldType('Status', values);
    expect(result.type).toBe('dropdown');
    expect(result.options).toEqual(['Active', 'Inactive', 'Pending']);
  });

  it('does NOT detect dropdown when all values are unique', () => {
    const values = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve'];
    const result = detectFieldType('Name', values);
    expect(result.type).toBe('text');
  });

  it('does NOT detect dropdown when unique count exceeds 10', () => {
    const values = Array.from({ length: 11 }, (_, i) => `Val${i}`).flatMap((v) => [v, v]);
    const result = detectFieldType('Category', values);
    expect(result.type).toBe('text');
  });

  // ── Default and edge cases ──────────────────────────────────────────────────

  it('returns text for mixed values', () => {
    expect(detectFieldType('Notes', ['hello', '123', 'world'])).toEqual({ type: 'text' });
  });

  it('returns text for empty values array', () => {
    expect(detectFieldType('Field', [])).toEqual({ type: 'text' });
  });

  it('returns text when all values are null/empty', () => {
    expect(detectFieldType('Field', [null, '', undefined])).toEqual({ type: 'text' });
  });

  it('column-name hint wins over value pattern (qty column with decimal values)', () => {
    expect(detectFieldType('Qty Ordered', ['1.5', '2.0'])).toEqual({ type: 'integer' });
  });
});
