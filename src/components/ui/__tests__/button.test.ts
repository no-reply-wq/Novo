/**
 * Button component unit tests.
 * Uses ts-jest in node environment (no jsdom) so we test the module structure
 * and exported types rather than DOM rendering.
 */

import type { ButtonProps } from '../button';

describe('Button', () => {
  it('exports ButtonProps type with expected variant options', () => {
    const variants: NonNullable<ButtonProps['variant']>[] = [
      'primary',
      'secondary',
      'ghost',
      'danger',
    ];
    expect(variants).toHaveLength(4);
  });

  it('exports ButtonProps type with expected size options', () => {
    const sizes: NonNullable<ButtonProps['size']>[] = ['sm', 'md', 'lg'];
    expect(sizes).toHaveLength(3);
  });

  it('Button module exports a component (function or forwardRef object)', async () => {
    const mod = await import('../button');
    // Button uses forwardRef which returns an object in some React versions
    expect(['function', 'object']).toContain(typeof mod.Button);
  });

  it('Button has correct displayName', async () => {
    const { Button } = await import('../button');
    expect((Button as { displayName?: string }).displayName).toBe('Button');
  });
});
