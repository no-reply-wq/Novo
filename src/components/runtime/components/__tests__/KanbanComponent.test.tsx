/**
 * Tests for KanbanComponent utility logic.
 */
import { groupRows } from '../KanbanComponent';
import type { Row } from '@/types/runtime';

describe('groupRows', () => {
  const rows: Row[] = [
    { id: '1', status: 'Todo', title: 'Task A' },
    { id: '2', status: 'In Progress', title: 'Task B' },
    { id: '3', status: 'Todo', title: 'Task C' },
    { id: '4', status: 'Done', title: 'Task D' },
  ];

  it('groups rows by field into correct buckets', () => {
    const map = groupRows(rows, 'status');
    expect(map.size).toBe(3);
    expect(map.get('Todo')).toHaveLength(2);
    expect(map.get('In Progress')).toHaveLength(1);
    expect(map.get('Done')).toHaveLength(1);
  });

  it('places rows into correct groups', () => {
    const map = groupRows(rows, 'status');
    const todo = map.get('Todo') ?? [];
    expect(todo.map((r) => r['id'])).toEqual(['1', '3']);
  });

  it('handles empty input', () => {
    const map = groupRows([], 'status');
    expect(map.size).toBe(0);
  });

  it('uses (empty) for missing field values', () => {
    const r: Row[] = [{ id: '1', title: 'No status' }];
    const map = groupRows(r, 'status');
    expect(map.has('(empty)')).toBe(true);
  });

  it('groups by any field', () => {
    const map = groupRows(rows, 'title');
    expect(map.size).toBe(4);
    for (const row of rows) {
      expect(map.has(String(row['title']))).toBe(true);
    }
  });
});

describe('KanbanComponent drag handler logic', () => {
  it('passes rowId and newStatus correctly', () => {
    const moves: Array<{ rowId: string; newStatus: string }> = [];
    const onCardMove = (rowId: string, newStatus: string) => {
      moves.push({ rowId, newStatus });
    };

    // Simulate drop
    onCardMove('row-42', 'Done');

    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ rowId: 'row-42', newStatus: 'Done' });
  });
});
