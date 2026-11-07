import { saveComponent, listComponents, getComponent, deleteComponent } from '@/platform/components/store';
import type { CustomComponentDef } from '@/platform/components/types';

function makePool(rows: unknown[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) } as unknown as import('pg').Pool;
}

const baseDef: Omit<CustomComponentDef, 'id' | 'version' | 'createdAt' | 'updatedAt'> = {
  appId: 'app-1', name: 'Test Widget', apiKey: 'test_widget', description: 'A test widget',
  code: 'export default function T() { return null; }',
  propsSchema: [{ name: 'title', type: 'string', label: 'Title', required: false }],
  previewProps: { title: 'Hello' },
};

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comp-1', app_id: 'app-1', name: 'Test Widget', api_key: 'test_widget',
    description: 'A test widget', version: 1,
    code: 'export default function T() { return null; }',
    props_schema: JSON.stringify([{ name: 'title', type: 'string', label: 'Title', required: false }]),
    preview_props: JSON.stringify({ title: 'Hello' }),
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('saveComponent', () => {
  it('calls INSERT and returns a mapped CustomComponentDef', async () => {
    const pool = makePool([makeRow()]);
    const result = await saveComponent(baseDef, pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('comp-1');
    expect(result.appId).toBe('app-1');
    expect(result.apiKey).toBe('test_widget');
    expect(result.version).toBe(1);
    expect(result.propsSchema).toHaveLength(1);
    expect(result.previewProps).toEqual({ title: 'Hello' });
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

describe('listComponents', () => {
  it('returns all components for an app', async () => {
    const pool = makePool([makeRow(), makeRow({ id: 'comp-2', name: 'Widget B', api_key: 'widget_b' })]);
    const results = await listComponents('app-1', pool);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('comp-1');
    expect(results[1]!.id).toBe('comp-2');
  });
  it('returns empty array when no components', async () => {
    const pool = makePool([]);
    const results = await listComponents('app-1', pool);
    expect(results).toEqual([]);
  });
});

describe('getComponent', () => {
  it('returns component when found', async () => {
    const pool = makePool([makeRow()]);
    const result = await getComponent('comp-1', pool);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('comp-1');
  });
  it('returns null when not found', async () => {
    const pool = makePool([]);
    const result = await getComponent('missing', pool);
    expect(result).toBeNull();
  });
});

describe('deleteComponent', () => {
  it('calls DELETE query', async () => {
    const pool = makePool([]);
    await deleteComponent('comp-1', pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = (pool.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM');
  });
});
