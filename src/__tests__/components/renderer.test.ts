import { renderCustomComponent } from '@/platform/components/renderer';
import type { CustomComponentDef } from '@/platform/components/types';
import type { ComponentSandbox } from '@/platform/components/renderer';

const makeDef = (overrides: Partial<CustomComponentDef> = {}): CustomComponentDef => ({
  id: 'comp-1', appId: 'app-1', name: 'Test Widget', apiKey: 'test_widget', version: 1,
  code: 'export default function T(props) { return `<div>${props.title}</div>`; }',
  propsSchema: [], createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

function makeSandbox(output: unknown): ComponentSandbox {
  return { run: jest.fn().mockResolvedValue({ output, logs: [] }) };
}

describe('renderCustomComponent', () => {
  it('returns string output from sandbox', async () => {
    const html = await renderCustomComponent(makeDef(), { title: 'Hello' }, makeSandbox('<div>Hello</div>'));
    expect(html).toBe('<div>Hello</div>');
  });
  it('stringifies non-string output', async () => {
    const html = await renderCustomComponent(makeDef(), {}, makeSandbox(42));
    expect(html).toBe('42');
  });
  it('returns empty string for null output', async () => {
    const html = await renderCustomComponent(makeDef(), {}, makeSandbox(null));
    expect(html).toBe('');
  });
  it('passes props JSON into wrapped code', async () => {
    const sb = makeSandbox('ok');
    await renderCustomComponent(makeDef(), { key: 'value' }, sb);
    const calledCode = (sb.run as jest.Mock).mock.calls[0][0] as string;
    expect(calledCode).toContain('"key":"value"');
  });
  it('calls sandbox with correct scriptId and tenantSlug', async () => {
    const sb = makeSandbox('ok');
    await renderCustomComponent(makeDef(), {}, sb);
    const ctx = (sb.run as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.scriptId).toBe('comp-1');
    expect(ctx.tenantSlug).toBe('app-1');
  });
});
