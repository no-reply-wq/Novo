import { dispatchTrigger, _test } from '@/platform/workflow/trigger-router';
import type { TriggerEvent } from '@/platform/workflow/types';

function makePool(rows: unknown[] = []): import('pg').Pool {
  return { query: jest.fn().mockResolvedValue({ rows }) } as unknown as import('pg').Pool;
}
function makeWorkflowRow(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, app_id: 'app-1', enabled: true, trigger: { type, ...extra } };
}

beforeEach(() => { _test.reset(); });

describe('dispatchTrigger - record_created', () => {
  it('enqueues matching workflow', async () => {
    const pool = makePool([makeWorkflowRow('wf-1', 'record_created', { tableApiKey: 'orders' })]);
    await dispatchTrigger({ type: 'record_created', appId: 'app-1', tenantSlug: 'acme', tableApiKey: 'orders' }, pool);
    expect(_test.mockQueue).toHaveLength(1);
    expect((_test.mockQueue[0] as { workflowId: string }).workflowId).toBe('wf-1');
  });
  it('does not enqueue when trigger type differs', async () => {
    const pool = makePool([makeWorkflowRow('wf-2', 'record_updated')]);
    await dispatchTrigger({ type: 'record_created', appId: 'app-1', tenantSlug: 'acme' }, pool);
    expect(_test.mockQueue).toHaveLength(0);
  });
  it('does not enqueue when tableApiKey differs', async () => {
    const pool = makePool([makeWorkflowRow('wf-3', 'record_created', { tableApiKey: 'invoices' })]);
    await dispatchTrigger({ type: 'record_created', appId: 'app-1', tenantSlug: 'acme', tableApiKey: 'orders' }, pool);
    expect(_test.mockQueue).toHaveLength(0);
  });
});

describe('dispatchTrigger - webhook', () => {
  it('enqueues when webhook path matches', async () => {
    const pool = makePool([makeWorkflowRow('wf-hook', 'webhook', { webhookPath: '/hooks/orders' })]);
    const event: TriggerEvent = { type: 'webhook', appId: 'app-1', tenantSlug: 'acme', record: { path: '/hooks/orders' } };
    await dispatchTrigger(event, pool);
    expect(_test.mockQueue).toHaveLength(1);
    expect((_test.mockQueue[0] as { workflowId: string }).workflowId).toBe('wf-hook');
  });
  it('does not enqueue when path differs', async () => {
    const pool = makePool([makeWorkflowRow('wf-hook', 'webhook', { webhookPath: '/hooks/orders' })]);
    await dispatchTrigger({ type: 'webhook', appId: 'app-1', tenantSlug: 'acme', record: { path: '/other' } }, pool);
    expect(_test.mockQueue).toHaveLength(0);
  });
});

describe('dispatchTrigger - multiple workflows', () => {
  it('enqueues all matching workflows', async () => {
    const pool = makePool([
      makeWorkflowRow('wf-a', 'record_created'),
      makeWorkflowRow('wf-b', 'record_created'),
      makeWorkflowRow('wf-c', 'record_updated'),
    ]);
    await dispatchTrigger({ type: 'record_created', appId: 'app-1', tenantSlug: 'acme' }, pool);
    expect(_test.mockQueue).toHaveLength(2);
    const ids = (_test.mockQueue as { workflowId: string }[]).map((j) => j.workflowId);
    expect(ids).toContain('wf-a');
    expect(ids).toContain('wf-b');
  });
});
