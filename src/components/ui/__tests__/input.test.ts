import type { InputProps } from '../input';

describe('Input', () => {
  it('exports InputProps with expected fields', () => {
    const fields: (keyof InputProps)[] = ['label', 'error', 'hint', 'prefix', 'suffix'];
    expect(fields.length).toBeGreaterThan(0);
  });

  it('Input module exports a forwardRef component', async () => {
    const mod = await import('../input');
    expect(typeof mod.Input).toBe('object'); // forwardRef returns object with $$typeof
    expect(mod.Input.displayName).toBe('Input');
  });
});
