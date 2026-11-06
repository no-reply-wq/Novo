/**
 * Tests for CalendarComponent utility functions.
 */
import { getDaysInMonth, getWeekDays, groupEventsByDate } from '../CalendarComponent';
import type { Row } from '@/types/runtime';

describe('getDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getDaysInMonth(2024, 1)).toBe(31);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(getDaysInMonth(2023, 2)).toBe(28);
  });

  it('returns 29 for February in leap year', () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
  });

  it('returns 30 for April', () => {
    expect(getDaysInMonth(2024, 4)).toBe(30);
  });

  it('returns 31 for December', () => {
    expect(getDaysInMonth(2024, 12)).toBe(31);
  });
});

describe('getWeekDays', () => {
  it('returns exactly 7 ISO date strings', () => {
    const days = getWeekDays(new Date('2024-01-15'));
    expect(days).toHaveLength(7);
  });

  it('starts on Monday', () => {
    // 2024-01-15 is a Monday
    const days = getWeekDays(new Date('2024-01-15'));
    expect(days[0]).toBe('2024-01-15');
  });

  it('ends on Sunday', () => {
    const days = getWeekDays(new Date('2024-01-15'));
    expect(days[6]).toBe('2024-01-21');
  });

  it('contains the input date somewhere in the week', () => {
    const input = new Date('2024-01-17'); // Wednesday
    const days = getWeekDays(input);
    expect(days).toContain('2024-01-17');
  });

  it('returns consecutive dates', () => {
    const days = getWeekDays(new Date('2024-03-01'));
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      expect(curr.getTime() - prev.getTime()).toBe(86400000); // 1 day
    }
  });
});

describe('groupEventsByDate', () => {
  const rows: Row[] = [
    { id: '1', eventDate: '2024-01-15T10:00:00Z', title: 'Morning meeting' },
    { id: '2', eventDate: '2024-01-15T14:00:00Z', title: 'Afternoon call' },
    { id: '3', eventDate: '2024-01-16', title: 'Next day event' },
    { id: '4', eventDate: '', title: 'No date' },
  ];

  it('groups events by date string (YYYY-MM-DD)', () => {
    const map = groupEventsByDate(rows, 'eventDate');
    expect(map.get('2024-01-15')).toHaveLength(2);
    expect(map.get('2024-01-16')).toHaveLength(1);
  });

  it('ignores rows with empty date', () => {
    const map = groupEventsByDate(rows, 'eventDate');
    expect(map.has('')).toBe(false);
  });

  it('returns empty map for empty input', () => {
    const map = groupEventsByDate([], 'eventDate');
    expect(map.size).toBe(0);
  });

  it('handles ISO timestamp dates by extracting date part', () => {
    const r: Row[] = [{ id: '1', date: '2024-06-21T08:30:00.000Z' }];
    const map = groupEventsByDate(r, 'date');
    expect(map.has('2024-06-21')).toBe(true);
  });
});
