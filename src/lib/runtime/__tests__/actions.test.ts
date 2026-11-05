import { runActionChain } from '../actions';
import type { ActionContext } from '../actions';
import type { Action, BindingContext } from '@/types/runtime';

const user: BindingContext['user'] = { id: 'u1', name: 'Alice', role: 'admin', locations: [] };

const makeBindingCtx = (): BindingContext => ({
  queries: {},
  pageState: {},
  user,
  urlParams: {},
});

const makeCtx = (overrides?: Partial<ActionContext>): ActionContext => ({
  tenantSlug: 'acme',
  appSlug: 'crm',
  bindingContext: makeBindingCtx(),
  navigate: jest.fn(),
  openModal: jest.fn(),
  submitForm: jest.fn().mockResolvedValue(undefined),
  refreshQuery: jest.fn().mockResolvedValue(undefined),
  setPageState: jest.fn(),
  showToast: jest.fn(),
  runWorkflow: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('runActionChain', () => {
  it('calls navigate with page and params', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'navigate', page: 'customers', params: { id: '5' } }];
    await runActionChain(actions, ctx);
    expect(ctx.navigate).toHaveBeenCalledWith('customers', { id: '5' });
  });

  it('calls openModal', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'openModal', modalId: 'modal-create' }];
    await runActionChain(actions, ctx);
    expect(ctx.openModal).toHaveBeenCalledWith('modal-create');
  });

  it('calls submitForm', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'submitForm', formId: 'form-1' }];
    await runActionChain(actions, ctx);
    expect(ctx.submitForm).toHaveBeenCalledWith('form-1');
  });

  it('calls refreshQuery', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'refreshQuery', queryId: 'q1' }];
    await runActionChain(actions, ctx);
    expect(ctx.refreshQuery).toHaveBeenCalledWith('q1');
  });

  it('calls setPageState with resolved value', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'setPageState', key: 'tab', value: 'overview' }];
    await runActionChain(actions, ctx);
    expect(ctx.setPageState).toHaveBeenCalledWith('tab', 'overview');
  });

  it('calls showToast with resolved message', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [{ type: 'showToast', message: 'Saved!', variant: 'success' }];
    await runActionChain(actions, ctx);
    expect(ctx.showToast).toHaveBeenCalledWith('Saved!', 'success');
  });

  it('calls runWorkflow', async () => {
    const ctx = makeCtx();
    const actions: Action[] = [
      { type: 'runWorkflow', workflowId: 'wf-send-email', input: { to: 'a@b.com' } },
    ];
    await runActionChain(actions, ctx);
    expect(ctx.runWorkflow).toHaveBeenCalledWith('wf-send-email', { to: 'a@b.com' });
  });

  it('runs a chain of multiple actions in order', async () => {
    const calls: string[] = [];
    const ctx = makeCtx({
      showToast: jest.fn((msg) => { calls.push(`toast:${msg}`); }),
      setPageState: jest.fn((k) => { calls.push(`state:${k}`); }),
    });
    const actions: Action[] = [
      { type: 'showToast', message: 'first', variant: 'info' },
      { type: 'setPageState', key: 'x', value: 1 },
    ];
    await runActionChain(actions, ctx);
    expect(calls).toEqual(['toast:first', 'state:x']);
  });

  it('resolves binding expressions in showToast message', async () => {
    const ctx = makeCtx({
      bindingContext: {
        ...makeBindingCtx(),
        pageState: { label: 'Record saved' },
      },
    });
    const actions: Action[] = [
      { type: 'showToast', message: '{{ pageState.label }}', variant: 'success' },
    ];
    await runActionChain(actions, ctx);
    expect(ctx.showToast).toHaveBeenCalledWith('Record saved', 'success');
  });
});
