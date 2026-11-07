/**
 * @jest-environment jsdom
 *
 * Tests for DataTable utilities (pure logic, no react-table import needed).
 */

// ── exportCsv helper (extracted logic) ───────────────────────────────────────

type Row = Record<string, unknown>;

function buildCsvLines(headers: string[], rows: Row[]): string[] {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))];
}

describe('CSV export logic', () => {
  it('produces correct header line', () => {
    const lines = buildCsvLines(['name', 'age'], []);
    expect(lines[0]).toBe('name,age');
  });

  it('produces correct data lines', () => {
    const rows: Row[] = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    const lines = buildCsvLines(['name', 'age'], rows);
    expect(lines[1]).toBe('Alice,30');
    expect(lines[2]).toBe('Bob,25');
  });

  it('escapes values containing commas', () => {
    const rows: Row[] = [{ name: 'Smith, John', age: 40 }];
    const lines = buildCsvLines(['name', 'age'], rows);
    expect(lines[1]).toBe('"Smith, John",40');
  });

  it('escapes values containing double quotes', () => {
    const rows: Row[] = [{ name: '"Alice"', age: 30 }];
    const lines = buildCsvLines(['name', 'age'], rows);
    expect(lines[1]).toBe('"""Alice""",30');
  });

  it('renders empty string for null/undefined values', () => {
    const rows: Row[] = [{ name: null, age: undefined }];
    const lines = buildCsvLines(['name', 'age'], rows);
    expect(lines[1]).toBe(',');
  });
});

// ── Totals calculation (extracted logic) ─────────────────────────────────────

function computeTotals(
  rows: Row[],
  spec: Record<string, 'sum' | 'avg' | 'count'>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, op] of Object.entries(spec)) {
    const nums = rows.map((r) => Number(r[field] ?? 0)).filter(isFinite);
    if (op === 'sum') result[field] = nums.reduce((a, b) => a + b, 0).toLocaleString();
    else if (op === 'avg') result[field] = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '0';
    else result[field] = String(nums.length);
  }
  return result;
}

describe('Totals row computation', () => {
  const rows: Row[] = [
    { name: 'A', amount: 100 },
    { name: 'B', amount: 200 },
    { name: 'C', amount: 300 },
  ];

  it('computes sum correctly', () => {
    const result = computeTotals(rows, { amount: 'sum' });
    expect(result.amount).toBe('600');
  });

  it('computes avg correctly', () => {
    const result = computeTotals(rows, { amount: 'avg' });
    expect(result.amount).toBe('200.00');
  });

  it('computes count correctly', () => {
    const result = computeTotals(rows, { amount: 'count' });
    expect(result.amount).toBe('3');
  });

  it('returns 0 avg for empty rows', () => {
    const result = computeTotals([], { amount: 'avg' });
    expect(result.amount).toBe('0');
  });
});

// ── SavedView management ──────────────────────────────────────────────────────

interface SavedView { id: string; name: string; }

function addView(views: SavedView[], name: string): SavedView[] {
  if (!name.trim()) return views;
  return [...views, { id: Date.now().toString(), name: name.trim() }];
}

function deleteView(views: SavedView[], id: string): SavedView[] {
  return views.filter((v) => v.id !== id);
}

describe('SavedView management', () => {
  it('adds a view', () => {
    const result = addView([], 'My View');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('My View');
  });

  it('ignores blank name', () => {
    const result = addView([], '   ');
    expect(result).toHaveLength(0);
  });

  it('trims name', () => {
    const result = addView([], '  Foo  ');
    expect(result[0].name).toBe('Foo');
  });

  it('deletes a view by id', () => {
    const views: SavedView[] = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    const result = deleteView(views, '1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('no-op when id not found', () => {
    const views: SavedView[] = [{ id: '1', name: 'A' }];
    const result = deleteView(views, '99');
    expect(result).toHaveLength(1);
  });
});
