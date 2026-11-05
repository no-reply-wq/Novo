import type { ColumnDef, TableSort } from '../table';

describe('Table', () => {
  it('exports Table component', async () => {
    const mod = await import('../table');
    expect(typeof mod.Table).toBe('function');
  });

  it('ColumnDef has required fields', () => {
    const col: ColumnDef = { key: 'name', header: 'Name', sortable: true };
    expect(col.key).toBe('name');
    expect(col.sortable).toBe(true);
  });

  it('TableSort direction is typed', () => {
    const sort: TableSort = { key: 'name', direction: 'asc' };
    expect(sort.direction).toBe('asc');
    const sort2: TableSort = { key: 'name', direction: 'desc' };
    expect(sort2.direction).toBe('desc');
  });

  it('render callback type accepts value, row and index', () => {
    const col: ColumnDef<{ name: string; age: number }> = {
      key: 'name',
      header: 'Name',
      render: (value, row, index) => `${String(value)}-${row.age}-${index}`,
    };
    const result = col.render?.('Alice', { name: 'Alice', age: 30 }, 0);
    expect(result).toBe('Alice-30-0');
  });
});
