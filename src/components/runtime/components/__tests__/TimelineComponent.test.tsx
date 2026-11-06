/**
 * Tests for TimelineComponent utility functions.
 */
import { dateToPixel, groupByField } from '../TimelineComponent';
import type { Row } from '@/types/runtime';

describe('dateToPixel', () => {
  const start = new Date('2024-01-01');
  const end = new Date('2024-01-31'); // 30 days
  const width = 300;

  it('returns 0 for the range start date', () => {
    expect(dateToPixel(start, start, end, width)).toBe(0);
  });

  it('returns width for the range end date', () => {
    expect(dateToPixel(end, start, end, width)).toBe(width);
  });

  it('returns roughly half-width for the midpoint', () => {
    const mid = new Date('2024-01-16'); // roughly middle
    const px = dateToPixel(mid, start, end, width);
    expect(px).toBeGreaterThan(140);
    expect(px).toBeLessThan(160);
  });

  it('clamps to 0 for dates before range', () => {
    const before = new Date('2023-12-01');
    expect(dateToPixel(before, start, end, width)).toBe(0);
  });

  it('clamps to width for dates after range', () => {
    const after = new Date('2024-03-01');
    expect(dateToPixel(after, start, end, width)).toBe(width);
  });

  it('returns 0 when range start equals range end', () => {
    expect(dateToPixel(start, start, start, width)).toBe(0);
  });
});

describe('groupByField (Timeline)', () => {
  const rows: Row[] = [
    { id: '1', project: 'Alpha', task: 'Design' },
    { id: '2', project: 'Alpha', task: 'Build' },
    { id: '3', project: 'Beta', task: 'Test' },
  ];

  it('groups by field correctly', () => {
    const map = groupByField(rows, 'project');
    expect(map.size).toBe(2);
    expect(map.get('Alpha')).toHaveLength(2);
    expect(map.get('Beta')).toHaveLength(1);
  });

  it('handles missing field values as (ungrouped)', () => {
    const r: Row[] = [{ id: '1', task: 'No project' }];
    const map = groupByField(r, 'project');
    expect(map.has('(ungrouped)')).toBe(true);
  });

  it('returns empty map for empty rows', () => {
    const map = groupByField([], 'project');
    expect(map.size).toBe(0);
  });
});
