import {
  resolveBindings,
  resolveValue,
  evaluateExpression,
  buildBindingContext,
} from '../binding';
import type { BindingContext } from '@/types/runtime';

const user: BindingContext['user'] = {
  id: 'u1',
  name: 'Alice',
  role: 'admin',
  locations: ['NY', 'LA'],
};

const makeCtx = (overrides?: Partial<BindingContext>): BindingContext => ({
  queries: {
    q1: {
      data: [
        { id: 1, name: 'Row A', value: 42 },
        { id: 2, name: 'Row B', value: 10 },
      ],
      total: 2,
      page: 1,
      selectedRow: { id: 1, name: 'Row A', value: 42 },
    },
  },
  pageState: { count: 5, label: 'hello' },
  user,
  urlParams: { id: '99', tab: 'details' },
  ...overrides,
});

describe('evaluateExpression', () => {
  it('resolves user.name', () => {
    expect(evaluateExpression('user.name', makeCtx())).toBe('Alice');
  });

  it('resolves user.locations', () => {
    expect(evaluateExpression('user.locations', makeCtx())).toEqual(['NY', 'LA']);
  });

  it('resolves urlParams.id', () => {
    expect(evaluateExpression('urlParams.id', makeCtx())).toBe('99');
  });

  it('resolves pageState.count', () => {
    expect(evaluateExpression('pageState.count', makeCtx())).toBe(5);
  });

  it('resolves q1.data', () => {
    expect(evaluateExpression('q1.data', makeCtx())).toHaveLength(2);
  });

  it('resolves q1.data[0].name', () => {
    expect(evaluateExpression('q1.data[0].name', makeCtx())).toBe('Row A');
  });

  it('resolves q1.data[1].value', () => {
    expect(evaluateExpression('q1.data[1].value', makeCtx())).toBe(10);
  });

  it('resolves q1.selectedRow.name', () => {
    expect(evaluateExpression('q1.selectedRow.name', makeCtx())).toBe('Row A');
  });

  it('resolves q1.total', () => {
    expect(evaluateExpression('q1.total', makeCtx())).toBe(2);
  });

  it('returns null for unknown query', () => {
    expect(evaluateExpression('missing.data', makeCtx())).toBeNull();
  });

  it('returns null for missing nested path', () => {
    expect(evaluateExpression('user.nonexistent', makeCtx())).toBeNull();
  });
});

describe('resolveValue', () => {
  const ctx = makeCtx();

  it('passes through plain string without bindings', () => {
    expect(resolveValue('Hello world', ctx)).toBe('Hello world');
  });

  it('resolves a full template binding', () => {
    expect(resolveValue('{{ user.name }}', ctx)).toBe('Alice');
  });

  it('interpolates bindings in a string', () => {
    expect(resolveValue('Hello {{ user.name }}, tab={{ urlParams.tab }}', ctx)).toBe(
      'Hello Alice, tab=details',
    );
  });

  it('passes through numbers unchanged', () => {
    expect(resolveValue(42, ctx)).toBe(42);
  });

  it('passes through booleans unchanged', () => {
    expect(resolveValue(false, ctx)).toBe(false);
  });

  it('passes through null', () => {
    expect(resolveValue(null, ctx)).toBeNull();
  });

  it('resolves ExpressionBinding objects', () => {
    expect(resolveValue({ __expr: 'q1.total' }, ctx)).toBe(2);
  });
});

describe('resolveBindings', () => {
  it('resolves all props in a record', () => {
    const ctx = makeCtx();
    const props = {
      title: '{{ user.name }}',
      count: { __expr: 'q1.total' },
      static: 'plain',
    };
    const result = resolveBindings(props, ctx);
    expect(result.title).toBe('Alice');
    expect(result.count).toBe(2);
    expect(result.static).toBe('plain');
  });
});

describe('buildBindingContext', () => {
  it('populates selectedRow from first data row', () => {
    const ctx = buildBindingContext(
      { myQ: { data: [{ x: 1 }], total: 1, page: 1 } },
      {},
      user,
      {},
    );
    expect(ctx.queries['myQ'].selectedRow).toEqual({ x: 1 });
  });

  it('sets selectedRow to null for empty result', () => {
    const ctx = buildBindingContext(
      { myQ: { data: [], total: 0, page: 1 } },
      {},
      user,
      {},
    );
    expect(ctx.queries['myQ'].selectedRow).toBeNull();
  });
});
