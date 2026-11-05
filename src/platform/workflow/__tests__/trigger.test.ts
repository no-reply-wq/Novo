/**
 * Tests for the trigger router.
 */

import { matchTriggers, handleWebhook } from '../trigger';
import type { WorkflowDef } from '@/platform/contracts/rules';

function makeWorkflow(
  event: WorkflowDef['trigger']['event'],
  overrides: Partial<WorkflowDef['trigger']> = {},
  wfOverrides: Partial<WorkflowDef> = {},
): WorkflowDef {
  const now = new Date();
  return {
    id: 'wf-1',
    appId: 'app-1',
    name: 'Test',
    trigger: {
      id: 't1',
      workflowId: 'wf-1',
      event,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    actions: [],
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...wfOverrides,
  };
}

describe('matchTriggers', () => {
  it('returns workflows matching the event', () => {
    const wf1 = makeWorkflow('record_created');
    const wf2 = makeWorkflow('record_updated');
    const wf3 = makeWorkflow('record_created');

    const result = matchTriggers([wf1, wf2, wf3], 'record_created', {});
    expect(result).toHaveLength(2);
    expect(result).toContain(wf1);
    expect(result).toContain(wf3);
  });

  it('excludes disabled workflows', () => {
    const wf1 = makeWorkflow('record_created', {}, { enabled: false });
    const wf2 = makeWorkflow('record_created');
    const result = matchTriggers([wf1, wf2], 'record_created', {});
    expect(result).toHaveLength(1);
    expect(result).toContain(wf2);
  });

  it('excludes disabled triggers', () => {
    const wf1 = makeWorkflow('record_created', { enabled: false });
    const wf2 = makeWorkflow('record_created');
    const result = matchTriggers([wf1, wf2], 'record_created', {});
    expect(result).toHaveLength(1);
    expect(result).toContain(wf2);
  });

  it('matches webhook_incoming by path', () => {
    const wf1 = makeWorkflow('webhook_incoming', { webhookPath: '/hooks/orders' });
    const wf2 = makeWorkflow('webhook_incoming', { webhookPath: '/hooks/invoices' });

    const result = matchTriggers([wf1, wf2], 'webhook_incoming', { path: '/hooks/orders' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wf-1');
  });

  it('returns empty array when no workflows match', () => {
    const wf = makeWorkflow('button_clicked');
    const result = matchTriggers([wf], 'schedule', {});
    expect(result).toHaveLength(0);
  });
});

describe('handleWebhook', () => {
  it('returns workflows matching the webhook path', () => {
    const now = new Date();
    const wf1: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'WebhookTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'webhook_incoming', webhookPath: '/hooks/test', enabled: true, createdAt: now, updatedAt: now },
      actions: [],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const result = handleWebhook('/hooks/test', { data: 'payload' }, [wf1]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(wf1);
  });

  it('returns empty array for unmatched path', () => {
    const now = new Date();
    const wf1: WorkflowDef = {
      id: 'wf-1',
      appId: 'app-1',
      name: 'WebhookTest',
      trigger: { id: 't1', workflowId: 'wf-1', event: 'webhook_incoming', webhookPath: '/hooks/other', enabled: true, createdAt: now, updatedAt: now },
      actions: [],
      enabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const result = handleWebhook('/hooks/test', {}, [wf1]);
    expect(result).toHaveLength(0);
  });
});
