/**
 * Canvas builder-side logic tests (node environment, no DOM).
 */

import type { CanvasPage, ComponentInstance } from '@/platform/ui/canvas/types';

function makePage(overrides: Partial<CanvasPage> = {}): CanvasPage {
  return { id: 'page-1', appId: 'app-1', name: 'Test Page', slug: 'test-page',
    layout: { type: 'grid', columns: 12, gap: 8 }, components: [], pageState: [], ...overrides };
}

function makeInstance(id: string, type: string, col = 0, row = 0, colSpan = 6): ComponentInstance {
  return { id, type, layout: { col, row, colSpan, rowSpan: 1 }, props: { label: type }, bindings: {}, events: {} };
}

function addComponent(page: CanvasPage, component: ComponentInstance): CanvasPage {
  return { ...page, components: [...page.components, component] };
}

function removeComponent(page: CanvasPage, id: string): CanvasPage {
  return { ...page, components: page.components.filter((c) => c.id !== id) };
}

function moveComponent(page: CanvasPage, id: string, col: number, row: number): CanvasPage {
  return { ...page, components: page.components.map((c) => c.id === id ? { ...c, layout: { ...c.layout, col, row } } : c) };
}

function updateComponent(page: CanvasPage, updated: ComponentInstance): CanvasPage {
  return { ...page, components: page.components.map((c) => c.id === updated.id ? updated : c) };
}

describe('Canvas page operations', () => {
  describe('addComponent', () => {
    it('adds a component to an empty page', () => {
      const result = addComponent(makePage(), makeInstance('c1', 'button'));
      expect(result.components).toHaveLength(1);
      expect(result.components[0].type).toBe('button');
    });
    it('adds multiple components preserving existing ones', () => {
      let page = makePage();
      page = addComponent(page, makeInstance('c1', 'button', 0, 0));
      page = addComponent(page, makeInstance('c2', 'table', 0, 1));
      page = addComponent(page, makeInstance('c3', 'text', 6, 0));
      expect(page.components).toHaveLength(3);
      expect(page.components.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    });
    it('does not mutate the original page', () => {
      const page = makePage();
      addComponent(page, makeInstance('c1', 'button'));
      expect(page.components).toHaveLength(0);
    });
  });

  describe('removeComponent', () => {
    it('removes a component by id', () => {
      let page = addComponent(makePage(), makeInstance('c1', 'button'));
      page = addComponent(page, makeInstance('c2', 'table'));
      expect(removeComponent(page, 'c1').components[0].id).toBe('c2');
    });
    it('leaves page unchanged if id not found', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button'));
      expect(removeComponent(page, 'nonexistent').components).toHaveLength(1);
    });
    it('returns empty array when removing the only component', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button'));
      expect(removeComponent(page, 'c1').components).toHaveLength(0);
    });
  });

  describe('moveComponent', () => {
    it('updates col and row of the target component', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button', 0, 0));
      const result = moveComponent(page, 'c1', 6, 2);
      expect(result.components[0].layout.col).toBe(6);
      expect(result.components[0].layout.row).toBe(2);
    });
    it('does not alter other components when moving one', () => {
      let page = addComponent(makePage(), makeInstance('c1', 'button', 0, 0));
      page = addComponent(page, makeInstance('c2', 'table', 0, 1));
      const result = moveComponent(page, 'c1', 6, 3);
      expect(result.components[1].layout.col).toBe(0);
    });
    it('preserves colSpan when moving', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button', 0, 0, 4));
      expect(moveComponent(page, 'c1', 8, 1).components[0].layout.colSpan).toBe(4);
    });
  });

  describe('updateComponent', () => {
    it('replaces the component with the updated version', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button'));
      const updated: ComponentInstance = { ...page.components[0], props: { label: 'Updated' } };
      expect(updateComponent(page, updated).components[0].props.label).toBe('Updated');
    });
    it('does not change unrelated components', () => {
      let page = addComponent(makePage(), makeInstance('c1', 'button'));
      page = addComponent(page, makeInstance('c2', 'table'));
      const updated: ComponentInstance = { ...page.components[0], props: { label: 'Changed' } };
      expect(updateComponent(page, updated).components[1].props.label).toBe('table');
    });
  });

  describe('selection logic', () => {
    it('selecting a component id returns the matching component', () => {
      let page = addComponent(makePage(), makeInstance('c1', 'button'));
      page = addComponent(page, makeInstance('c2', 'table'));
      expect(page.components.find((c) => c.id === 'c2')?.type).toBe('table');
    });
    it('selecting null returns undefined', () => {
      const page = addComponent(makePage(), makeInstance('c1', 'button'));
      const selectedId: string | null = null;
      expect(selectedId ? page.components.find((c) => c.id === selectedId) : undefined).toBeUndefined();
    });
  });
});

describe('Page state variables', () => {
  it('can add a page state variable', () => {
    const page: CanvasPage = { ...makePage(), pageState: [{ name: 'selectedId', type: 'string', defaultValue: '' }] };
    expect(page.pageState[0].name).toBe('selectedId');
  });
  it('can remove a page state variable by index', () => {
    const page = makePage({ pageState: [{ name: 'a', type: 'string' }, { name: 'b', type: 'number' }] });
    const result = { ...page, pageState: page.pageState.filter((_, i) => i !== 0) };
    expect(result.pageState[0].name).toBe('b');
  });
});
