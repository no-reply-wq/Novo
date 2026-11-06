/**
 * Tests for ChartComponent utility functions.
 */
import { autoScale, dataToBars, pieSlices } from '../ChartComponent';
import type { Row } from '@/types/runtime';

describe('autoScale', () => {
  it('returns {0,10,2} for empty input', () => {
    const s = autoScale([]);
    expect(s.min).toBe(0);
    expect(s.max).toBe(10);
  });

  it('min is 0 when all values are positive', () => {
    const s = autoScale([10, 20, 30, 40, 50]);
    expect(s.min).toBe(0);
  });

  it('max is nicely rounded up', () => {
    const s = autoScale([10, 23, 45]);
    expect(s.max).toBeGreaterThanOrEqual(45);
    expect(s.max % s.step).toBe(0); // max is a multiple of step
  });

  it('handles single value', () => {
    const s = autoScale([100]);
    expect(s.max).toBeGreaterThanOrEqual(100);
    expect(s.min).toBe(0);
  });

  it('handles negative values by going negative on min', () => {
    const s = autoScale([-50, -10, 20]);
    expect(s.min).toBeLessThan(0);
  });
});

describe('dataToBars', () => {
  const data: Row[] = [
    { label: 'A', value: 10 },
    { label: 'B', value: 20 },
    { label: 'C', value: 30 },
  ];

  it('returns one bar per data row', () => {
    const bars = dataToBars(data, 'label', 'value', 300, 200);
    expect(bars).toHaveLength(3);
  });

  it('bars have correct labels', () => {
    const bars = dataToBars(data, 'label', 'value', 300, 200);
    expect(bars.map((b) => b.label)).toEqual(['A', 'B', 'C']);
  });

  it('tallest bar is at chartHeight', () => {
    const bars = dataToBars(data, 'label', 'value', 300, 200);
    const maxH = Math.max(...bars.map((b) => b.height));
    expect(maxH).toBe(200); // the bar for value=30 fills full height
  });

  it('bars have positive widths', () => {
    const bars = dataToBars(data, 'label', 'value', 300, 200);
    expect(bars.every((b) => b.width > 0)).toBe(true);
  });

  it('bars are ordered left to right', () => {
    const bars = dataToBars(data, 'label', 'value', 300, 200);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].x).toBeGreaterThan(bars[i - 1].x);
    }
  });

  it('returns empty array for empty data', () => {
    expect(dataToBars([], 'label', 'value', 300, 200)).toHaveLength(0);
  });
});

describe('pieSlices', () => {
  const data: Row[] = [
    { label: 'A', value: 25 },
    { label: 'B', value: 75 },
  ];

  it('returns one slice per data row', () => {
    const slices = pieSlices(data, 'value');
    expect(slices).toHaveLength(2);
  });

  it('slices sum to 2π (full circle)', () => {
    const slices = pieSlices(data, 'value');
    const totalAngle = slices.reduce((sum, s) => sum + (s.endAngle - s.startAngle), 0);
    expect(totalAngle).toBeCloseTo(2 * Math.PI);
  });

  it('percentages are correct (25% and 75%)', () => {
    const slices = pieSlices(data, 'value');
    expect(slices[0].percentage).toBe(25);
    expect(slices[1].percentage).toBe(75);
  });

  it('each slice startAngle equals previous endAngle', () => {
    const slices = pieSlices(data, 'value');
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startAngle).toBeCloseTo(slices[i - 1].endAngle);
    }
  });

  it('returns empty array when all values are 0', () => {
    const r: Row[] = [{ label: 'X', value: 0 }];
    expect(pieSlices(r, 'value')).toHaveLength(0);
  });
});
