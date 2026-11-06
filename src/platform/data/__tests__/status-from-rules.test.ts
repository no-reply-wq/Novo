/**
 * Tests for src/platform/data/status-from-rules.ts
 */

import {
  evaluateStatusFromRules,
  deriveStatus,
  getAffectedParentIds,
} from '../status-from-rules';
import { NotConfiguredError } from '../errors';
import type { StatusFromRulesOptions } from '@/platform/contracts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basicOpts: StatusFromRulesOptions = {
  defaultStatus: 'Draft',
  rules: [
    { label: 'Approved', condition: 'status = "Approved"', rank: 1, color: 'green' },
    { label: 'Pending',  condition: 'status = "Pending"',  rank: 2, color: 'yellow' },
    { label: 'Rejected', condition: 'status = "Rejected"', rank: 3, color: 'red' },
  ],
};

// ─── evaluateStatusFromRules ──────────────────────────────────────────────────

describe('evaluateStatusFromRules — first-match wins', () => {
  it('returns the label of the first matching rule', () => {
    const result = evaluateStatusFromRules(basicOpts, { status: 'Approved' });
    expect(result.status).toBe('Approved');
    expect(result.matchedRuleRank).toBe(1);
    expect(result.matchedRuleLabel).toBe('Approved');
  });

  it('matches second rule when first does not match', () => {
    const result = evaluateStatusFromRules(basicOpts, { status: 'Pending' });
    expect(result.status).toBe('Pending');
    expect(result.matchedRuleRank).toBe(2);
  });

  it('matches third rule when first two do not match', () => {
    const result = evaluateStatusFromRules(basicOpts, { status: 'Rejected' });
    expect(result.status).toBe('Rejected');
    expect(result.matchedRuleRank).toBe(3);
  });
});

describe('evaluateStatusFromRules — no match', () => {
  it('returns defaultStatus when no rule matches', () => {
    const result = evaluateStatusFromRules(basicOpts, { status: 'Unknown' });
    expect(result.status).toBe('Draft');
    expect(result.matchedRuleRank).toBeNull();
    expect(result.matchedRuleLabel).toBeNull();
  });

  it('returns defaultStatus when record is empty', () => {
    const result = evaluateStatusFromRules(basicOpts, {});
    expect(result.status).toBe('Draft');
  });
});

describe('evaluateStatusFromRules — rank ordering', () => {
  it('respects rank order (lower rank wins over higher)', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Unknown',
      rules: [
        { label: 'B', condition: 'x > 0', rank: 2 },
        { label: 'A', condition: 'x > 0', rank: 1 }, // same condition, lower rank
      ],
    };
    const result = evaluateStatusFromRules(opts, { x: 5 });
    expect(result.status).toBe('A'); // rank 1 wins
    expect(result.matchedRuleRank).toBe(1);
  });

  it('evaluates rules in rank order even when stored unordered', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Z',
      rules: [
        { label: 'Third',  condition: 'val = 1', rank: 30 },
        { label: 'First',  condition: 'val = 1', rank: 10 },
        { label: 'Second', condition: 'val = 1', rank: 20 },
      ],
    };
    const result = evaluateStatusFromRules(opts, { val: 1 });
    expect(result.status).toBe('First');
  });
});

describe('evaluateStatusFromRules — skips invalid rule conditions', () => {
  it('skips a rule that throws on eval and continues to next', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Fallback',
      rules: [
        { label: 'Bad',  condition: '!!!invalid***', rank: 1 },
        { label: 'Good', condition: 'x = 1',         rank: 2 },
      ],
    };
    const result = evaluateStatusFromRules(opts, { x: 1 });
    expect(result.status).toBe('Good');
  });

  it('skips rules with empty conditions', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Default',
      rules: [
        { label: 'Empty', condition: '  ', rank: 1 },
      ],
    };
    const result = evaluateStatusFromRules(opts, { x: 1 });
    expect(result.status).toBe('Default');
  });
});

describe('evaluateStatusFromRules — with related rows in context', () => {
  it('uses record fields in expressions', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Open',
      rules: [
        { label: 'Has Lines', condition: 'line_count > 0', rank: 1 },
      ],
    };
    // line_count is a stored field on the record (pre-computed rollup or stored number)
    const row = { id: 'po-1', line_count: 3 };
    const result = evaluateStatusFromRules(opts, row);
    expect(result.status).toBe('Has Lines');
  });

  it('uses relation rows via relations context', () => {
    const opts: StatusFromRulesOptions = {
      defaultStatus: 'Open',
      rules: [
        // Reference a field directly from the record (status_from_rules operates on the record)
        { label: 'Active', condition: 'status = "active"', rank: 1 },
      ],
    };
    const row = { id: 'po-1', status: 'active' };
    const result = evaluateStatusFromRules(opts, row, {
      relations: { lines: [{ id: 'l1', amount: 100 }] },
    });
    expect(result.status).toBe('Active');
  });
});

describe('evaluateStatusFromRules — NotConfiguredError', () => {
  it('throws NotConfiguredError when rules is undefined', () => {
    const opts = { defaultStatus: 'X' } as StatusFromRulesOptions;
    expect(() => evaluateStatusFromRules(opts, {})).toThrow(NotConfiguredError);
  });
});

// ─── deriveStatus ─────────────────────────────────────────────────────────────

describe('deriveStatus', () => {
  it('returns empty string when opts is undefined', () => {
    expect(deriveStatus(undefined, {})).toBe('');
  });

  it('returns defaultStatus when opts is defined but no match', () => {
    expect(deriveStatus(basicOpts, { status: 'Unknown' })).toBe('Draft');
  });

  it('returns matched status', () => {
    expect(deriveStatus(basicOpts, { status: 'Approved' })).toBe('Approved');
  });

  it('returns defaultStatus on internal error (graceful degradation)', () => {
    // opts with undefined rules (forced to any to bypass TS)
    const badOpts = { defaultStatus: 'Safe' } as StatusFromRulesOptions;
    expect(deriveStatus(badOpts, {})).toBe('Safe');
  });
});

// ─── getAffectedParentIds ─────────────────────────────────────────────────────

describe('getAffectedParentIds', () => {
  it('returns set with parent id from fk field', () => {
    const childRow = { id: 'line-1', order_id: 'ord-123', amount: 100 };
    const result = getAffectedParentIds(childRow, 'order_id');
    expect(result).toEqual(new Set(['ord-123']));
  });

  it('returns empty set when fk field is missing', () => {
    const result = getAffectedParentIds({ id: 'x' }, 'order_id');
    expect(result.size).toBe(0);
  });

  it('returns empty set when fk field is null', () => {
    const result = getAffectedParentIds({ id: 'x', order_id: null }, 'order_id');
    expect(result.size).toBe(0);
  });

  it('returns empty set when fk field is empty string', () => {
    const result = getAffectedParentIds({ id: 'x', order_id: '' }, 'order_id');
    expect(result.size).toBe(0);
  });

  it('handles multiple child rows by accumulating parent ids', () => {
    const rows = [
      { id: 'l1', order_id: 'ord-A' },
      { id: 'l2', order_id: 'ord-B' },
      { id: 'l3', order_id: 'ord-A' }, // duplicate
    ];
    const parentIds = rows.reduce<Set<string>>(
      (acc, row) => new Set([...acc, ...getAffectedParentIds(row, 'order_id')]),
      new Set(),
    );
    expect(parentIds).toEqual(new Set(['ord-A', 'ord-B']));
  });
});
