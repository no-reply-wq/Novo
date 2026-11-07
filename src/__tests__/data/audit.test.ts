/**
 * Unit tests for audit.ts (buildDiff — no DB needed).
 * Integration tests for logAudit / getRecordHistory require TEST_DATABASE_URL.
 */

import { buildDiff } from '@/platform/data/audit';

describe('buildDiff', () => {
  it('returns empty diff when records are identical', () => {
    const before = { name: 'Alice', qty: 5 };
    const after  = { name: 'Alice', qty: 5 };
    expect(buildDiff(before, after)).toEqual({});
  });

  it('detects changed value', () => {
    const before = { name: 'Alice', qty: 5 };
    const after  = { name: 'Alice', qty: 10 };
    const diff = buildDiff(before, after);
    expect(diff).toEqual({ qty: { before: 5, after: 10 } });
  });

  it('detects added key', () => {
    const before = { name: 'Alice' };
    const after  = { name: 'Alice', email: 'alice@example.com' };
    const diff = buildDiff(before, after);
    expect(diff).toEqual({ email: { before: null, after: 'alice@example.com' } });
  });

  it('detects removed key', () => {
    const before = { name: 'Alice', note: 'old' };
    const after  = { name: 'Alice' };
    const diff = buildDiff(before, after);
    expect(diff).toEqual({ note: { before: 'old', after: null } });
  });

  it('handles null and undefined consistently', () => {
    const before = { tag: null };
    const after  = { tag: null };
    expect(buildDiff(before, after)).toEqual({});
  });

  it('detects nested object change via JSON comparison', () => {
    const before = { meta: { a: 1 } };
    const after  = { meta: { a: 2 } };
    const diff = buildDiff(before, after);
    expect(diff['meta']).toBeDefined();
    expect(diff['meta'].before).toEqual({ a: 1 });
    expect(diff['meta'].after).toEqual({ a: 2 });
  });
});
