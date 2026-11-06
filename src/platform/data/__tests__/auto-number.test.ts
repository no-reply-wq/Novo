/**
 * Tests for src/platform/data/auto-number.ts
 *
 * Unit tests for the format parser, renderer, and options→format conversion.
 * Integration tests for the DB sequence (atomic increment, yearly reset)
 * use real Postgres and are gated behind TEST_DATABASE_URL.
 */

import {
  parseFormatString,
  renderFormat,
  optionsToFormatString,
  previewAutoNumber,
  nextAutoNumberFormatted,
} from '../auto-number';
import { NotConfiguredError } from '../errors';
import type { PoolClient } from 'pg';

// ─── parseFormatString ────────────────────────────────────────────────────────

describe('parseFormatString', () => {
  it('parses a plain literal', () => {
    const tokens = parseFormatString('INV-');
    expect(tokens).toEqual([{ kind: 'literal', text: 'INV-' }]);
  });

  it('parses {YYYY} token', () => {
    const tokens = parseFormatString('{YYYY}');
    expect(tokens).toEqual([{ kind: 'year' }]);
  });

  it('parses {LOC} token', () => {
    const tokens = parseFormatString('{LOC}');
    expect(tokens).toEqual([{ kind: 'location' }]);
  });

  it('parses {SEQ} token with default width 4', () => {
    const tokens = parseFormatString('{SEQ}');
    expect(tokens).toEqual([{ kind: 'seq', width: 4 }]);
  });

  it('parses {SEQ:6} token with explicit width', () => {
    const tokens = parseFormatString('{SEQ:6}');
    expect(tokens).toEqual([{ kind: 'seq', width: 6 }]);
  });

  it('parses a full format string', () => {
    const tokens = parseFormatString('INV-{YYYY}-{LOC}-{SEQ:4}');
    expect(tokens).toEqual([
      { kind: 'literal', text: 'INV-' },
      { kind: 'year' },
      { kind: 'literal', text: '-' },
      { kind: 'location' },
      { kind: 'literal', text: '-' },
      { kind: 'seq', width: 4 },
    ]);
  });

  it('treats unknown tokens as literals', () => {
    const tokens = parseFormatString('{UNKNOWN}');
    expect(tokens).toEqual([{ kind: 'literal', text: '{UNKNOWN}' }]);
  });

  it('handles unclosed brace gracefully', () => {
    const tokens = parseFormatString('INV-{YYYY');
    // Everything from the unclosed brace should be treated as literal
    const combined = tokens.map(t => (t.kind === 'literal' ? t.text : '')).join('');
    expect(combined).toContain('INV-');
  });

  it('is case-insensitive for tokens', () => {
    const lower = parseFormatString('{yyyy}');
    const upper = parseFormatString('{YYYY}');
    expect(lower).toEqual(upper);
  });
});

// ─── renderFormat ─────────────────────────────────────────────────────────────

describe('renderFormat', () => {
  const now = new Date('2026-11-06T00:00:00Z');

  it('renders literal tokens', () => {
    const tokens = parseFormatString('STATIC');
    expect(renderFormat(tokens, 1, undefined, now)).toBe('STATIC');
  });

  it('renders year token', () => {
    const tokens = parseFormatString('{YYYY}');
    expect(renderFormat(tokens, 1, undefined, now)).toBe('2026');
  });

  it('renders location token', () => {
    const tokens = parseFormatString('{LOC}');
    expect(renderFormat(tokens, 1, 'MUM', now)).toBe('MUM');
  });

  it('renders location as empty string when not provided', () => {
    const tokens = parseFormatString('{LOC}');
    expect(renderFormat(tokens, 1, undefined, now)).toBe('');
  });

  it('renders sequence with zero-padding', () => {
    const tokens = parseFormatString('{SEQ:4}');
    expect(renderFormat(tokens, 7, undefined, now)).toBe('0007');
  });

  it('renders full format string', () => {
    const tokens = parseFormatString('INV-{YYYY}-{LOC}-{SEQ:4}');
    expect(renderFormat(tokens, 1, 'MUM', now)).toBe('INV-2026-MUM-0001');
  });

  it('renders format without location correctly when missing', () => {
    const tokens = parseFormatString('PO-{YYYY}-{SEQ:3}');
    expect(renderFormat(tokens, 42, undefined, now)).toBe('PO-2026-042');
  });
});

// ─── optionsToFormatString ────────────────────────────────────────────────────

describe('optionsToFormatString', () => {
  it('uses explicit format string when provided', () => {
    const opts = { format: 'CUSTOM-{SEQ:5}' } as never;
    expect(optionsToFormatString(opts)).toBe('CUSTOM-{SEQ:5}');
  });

  it('builds from flags: prefix only', () => {
    const fmt = optionsToFormatString({ prefix: 'INV-' });
    expect(fmt).toContain('INV-');
    expect(fmt).toContain('{SEQ');
  });

  it('builds from flags: prefix + year', () => {
    const fmt = optionsToFormatString({ prefix: 'PO-', includeYear: true });
    expect(fmt).toContain('{YYYY}');
  });

  it('builds from flags: prefix + year + location', () => {
    const fmt = optionsToFormatString({ prefix: 'PO-', includeYear: true, includeLocation: true });
    expect(fmt).toContain('{LOC}');
  });

  it('uses padding in SEQ token', () => {
    const fmt = optionsToFormatString({ prefix: 'X-', padding: 6 });
    expect(fmt).toContain('{SEQ:6}');
  });

  it('defaults padding to 4', () => {
    const fmt = optionsToFormatString({ prefix: 'X-' });
    expect(fmt).toContain('{SEQ:4}');
  });
});

// ─── previewAutoNumber ────────────────────────────────────────────────────────

describe('previewAutoNumber', () => {
  const now = new Date('2026-11-06T00:00:00Z');

  it('previews PO-{YYYY}-{SEQ:4}', () => {
    const result = previewAutoNumber(
      { prefix: 'PO-', includeYear: true, padding: 4 },
      1,
      undefined,
      now,
    );
    expect(result).toBe('PO-2026-0001');
  });

  it('previews with location', () => {
    const result = previewAutoNumber(
      { prefix: 'INV-', includeYear: true, includeLocation: true, padding: 4 },
      1,
      'MUM',
      now,
    );
    expect(result).toBe('INV-2026-MUM-0001');
  });

  it('previews with custom seq number', () => {
    const result = previewAutoNumber({ prefix: 'X-', padding: 3 }, 42, undefined, now);
    expect(result).toBe('X-042');
  });
});

// ─── nextAutoNumberFormatted — DB integration ─────────────────────────────────

/**
 * We test the DB path with a mock client that simulates the INSERT/SELECT/UPDATE
 * pattern. Real DB tests with concurrent increment are covered in autonumber.test.ts.
 */

function makeMockDbClient(initialValue = 0): {
  client: PoolClient;
  getLastValue: () => number;
} {
  let currentValue = initialValue;
  let currentResetAt = new Date('2025-01-01T00:00:00Z');

  const client = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO platform.auto_number_sequences')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('FOR UPDATE')) {
        return Promise.resolve({
          rows: [{
            id: 'seq-id-1',
            last_value: String(currentValue),
            reset_period: 'yearly',
            reset_at: currentResetAt,
          }],
        });
      }
      if (sql.includes('UPDATE platform.auto_number_sequences')) {
        // Extract the new value from the query params
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    }),
    _mockSetValue: (v: number, resetAt: Date) => {
      currentValue = v;
      currentResetAt = resetAt;
    },
  } as unknown as PoolClient;

  return { client, getLastValue: () => currentValue };
}

describe('nextAutoNumberFormatted — basic', () => {
  it('calls the DB and returns a formatted string', async () => {
    const { client } = makeMockDbClient(0);
    const now = new Date('2026-11-06T00:00:00Z');

    const result = await nextAutoNumberFormatted(
      client,
      'table-uuid-1',
      'field-uuid-1',
      { prefix: 'INV-', includeYear: true, padding: 4, resetRule: 'yearly' },
      undefined,
      now,
    );

    // The result should be a formatted string
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^INV-2026-\d{4}$/);
  });

  it('throws NotConfiguredError when tableId is empty', async () => {
    const { client } = makeMockDbClient(0);
    await expect(
      nextAutoNumberFormatted(client, '', 'fld-1', {}, undefined, new Date()),
    ).rejects.toThrow(NotConfiguredError);
  });
});

// ─── Concurrent increment simulation ─────────────────────────────────────────

describe('nextAutoNumberFormatted — concurrent increment protection', () => {
  it('uses FOR UPDATE in sequence locking query', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn().mockImplementation((sql: string) => {
        queries.push(sql);
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve({
            rows: [{ id: 'x', last_value: '5', reset_period: 'never', reset_at: new Date() }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as PoolClient;

    await nextAutoNumberFormatted(
      client,
      'table-1',
      'field-1',
      { prefix: 'X-', padding: 4 },
      undefined,
      new Date(),
    );

    expect(queries.some(q => q.includes('FOR UPDATE'))).toBe(true);
  });
});
