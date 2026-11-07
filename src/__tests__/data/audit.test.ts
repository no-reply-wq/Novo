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
import { buildDiff } from '@/platform/data/audit';
describe('buildDiff', () => {
  it('empty when equal', () => { expect(buildDiff({a:1},{a:1})).toEqual({}); });
  it('changed value', () => { expect(buildDiff({q:5},{q:10})).toEqual({q:{before:5,after:10}}); });
  it('added key', () => { expect(buildDiff({a:1},{a:1,b:'x'})).toEqual({b:{before:null,after:'x'}}); });
  it('removed key', () => { expect(buildDiff({a:1,n:'o'},{a:1})).toEqual({n:{before:'o',after:null}}); });
  it('null==null no diff', () => { expect(buildDiff({t:null},{t:null})).toEqual({}); });
  it('nested change', () => { const d = buildDiff({m:{a:1}},{m:{a:2}}); expect(d['m']?.before).toEqual({a:1}); expect(d['m']?.after).toEqual({a:2}); });
});
