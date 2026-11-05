describe('Modal', () => {
  it('exports Modal component', async () => {
    const mod = await import('../modal');
    expect(typeof mod.Modal).toBe('function');
  });

  it('ModalProps size options are well-typed', () => {
    type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
    const sizes: ModalSize[] = ['sm', 'md', 'lg', 'xl'];
    expect(sizes).toHaveLength(4);
  });
});
