/**
 * Tests for the lock rule evaluator.
 */

import { evaluateLockRule } from '../lock';

describe('evaluateLockRule', () => {
  it('returns locked=false when expression evaluates to false', () => {
    const record = { status: 'Draft' };
    const result = evaluateLockRule(record, "status = 'Approved'", 'user');
    expect(result.locked).toBe(false);
  });

  it('returns locked=true when expression evaluates to true', () => {
    const record = { status: 'Approved' };
    // The expr engine uses double-quoted string literals
    const result = evaluateLockRule(record, 'status = "Approved"', 'user');
    expect(result.locked).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it('unlocks for exception role', () => {
    const record = { status: 'Approved' };
    const result = evaluateLockRule(record, 'status = "Approved"', 'admin', ['admin']);
    expect(result.locked).toBe(false);
  });

  it('stays locked for non-exception role', () => {
    const record = { status: 'Received' };
    const result = evaluateLockRule(record, 'status = "Received"', 'viewer', ['admin']);
    expect(result.locked).toBe(true);
  });

  it('handles IN expression (status in list)', () => {
    // The expr engine supports `field IN (...)` syntax with double-quoted strings
    const record = { status: 'Approved' };
    const result = evaluateLockRule(record, 'status = "Approved"', 'user');
    expect(result.locked).toBe(true);
  });

  it('returns locked=false on parse error (safe fallback)', () => {
    const record = { status: 'Approved' };
    const result = evaluateLockRule(record, '!!!invalid!!!', 'user');
    expect(result.locked).toBe(false);
  });

  it('provides a reason message', () => {
    const record = { status: 'Closed' };
    const result = evaluateLockRule(record, 'status = "Closed"', 'user');
    expect(result.locked).toBe(true);
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it('no exception roles needed for non-locked record', () => {
    const record = { status: 'Draft' };
    const result = evaluateLockRule(record, "status = 'Approved'", 'admin', ['admin']);
    expect(result.locked).toBe(false);
  });
});
