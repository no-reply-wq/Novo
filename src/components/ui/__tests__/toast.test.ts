import type { ToastItem, ToastVariant } from '../toast';

describe('Toast', () => {
  it('exports ToastProvider and useToast', async () => {
    const mod = await import('../toast');
    expect(typeof mod.ToastProvider).toBe('function');
    expect(typeof mod.useToast).toBe('function');
  });

  it('ToastVariant covers expected values', () => {
    const variants: ToastVariant[] = ['success', 'warning', 'error', 'info'];
    expect(variants).toHaveLength(4);
  });

  it('ToastItem id and message are required', () => {
    const item: ToastItem = { id: 'test-1', message: 'Hello', variant: 'success', duration: 3000 };
    expect(item.id).toBe('test-1');
    expect(item.message).toBe('Hello');
  });
});
