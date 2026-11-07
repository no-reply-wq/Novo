/**
 * Unit tests for the auto-number formatter (no DB needed for format tests).
 * Integration tests with real Postgres require TEST_DATABASE_URL.
 */

import { formatAutoNumber } from '@/platform/data/autonumber';
import type { AutoNumberOptions } from '@/platform/contracts';

describe('formatAutoNumber', () => {
  const baseDate = new Date('2026-03-15T00:00:00Z');

  it('pads sequence with default padding (4)', () => {
    const opts: AutoNumberOptions = {};
    expect(formatAutoNumber(1, opts, undefined, baseDate)).toBe('0001');
  });

  it('applies prefix', () => {
    const opts: AutoNumberOptions = { prefix: 'PO-', padding: 4 };
    expect(formatAutoNumber(5, opts, undefined, baseDate)).toBe('PO-0005');
  });

  it('includes year when configured', () => {
    const opts: AutoNumberOptions = { prefix: 'INV-', includeYear: true, padding: 4 };
    const result = formatAutoNumber(3, opts, undefined, baseDate);
    expect(result).toBe('INV-2026-0003');
  });

  it('includes location code when configured', () => {
    const opts: AutoNumberOptions = { prefix: 'GRN-', includeLocation: true, padding: 4 };
    const result = formatAutoNumber(7, opts, 'MUM', baseDate);
    expect(result).toBe('GRN-MUM-0007');
  });

  it('applies custom padding', () => {
    const opts: AutoNumberOptions = { prefix: 'REF-', padding: 6 };
    expect(formatAutoNumber(42, opts, undefined, baseDate)).toBe('REF-000042');
  });

  it('handles no prefix with year', () => {
    const opts: AutoNumberOptions = { includeYear: true, padding: 3 };
    expect(formatAutoNumber(1, opts, undefined, baseDate)).toBe('2026-001');
  });
});
