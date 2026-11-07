/**
 * Workflow trigger router — dispatches trigger events to pg-boss.
 */

import { Pool } from 'pg';
import type { TriggerEvent, TriggerType } from './types';

interface BossLike {
  send(queue: string, data: unknown, opts?: Record<string, unknown>): Promise<string | null>;
}

let _boss: BossLike | null = null;

export function setBoss(boss: BossLike): void {
  _boss = boss;
}

const WORKFLOW_QUEUE = 'workflow-trigger';

interface WorkflowRow {
  id: string;
  app_id: string;
  enabled: boolean;
  trigger: {
    type: TriggerType;
    tableApiKey?: string;
    fieldApiKey?: string;
    webhookPath?: string;
    cronExpr?: string;
  };
}

export async function dispatchTrigger(
  event: TriggerEvent,
  pgPool: Pool,
): Promise<void> {
  const result = await pgPool.query<WorkflowRow>(
    `SELECT id, app_id, enabled, trigger
     FROM workflows
     WHERE app_id = $1 AND enabled = true`,
    [event.appId],
  );

  const matched = result.rows.filter((row) => matchesTrigger(row, event));

  for (const wf of matched) {
    const jobData = {
      workflowId: wf.id,
      appId: event.appId,
      tenantSlug: event.tenantSlug,
      triggerEvent: event,
    };

    if (process.env.NODE_ENV === 'test') {
      _mockQueue.push(jobData);
    } else {
      if (!_boss) throw new Error('dispatchTrigger: pg-boss not initialised — call setBoss() first');
import { Pool } from 'pg';
import type { TriggerEvent, TriggerType } from './types';

interface BossLike { send(queue: string, data: unknown, opts?: Record<string, unknown>): Promise<string | null>; }
let _boss: BossLike | null = null;
export function setBoss(boss: BossLike): void { _boss = boss; }

const WORKFLOW_QUEUE = 'workflow-trigger';

interface WorkflowRow { id: string; app_id: string; enabled: boolean; trigger: { type: TriggerType; tableApiKey?: string; fieldApiKey?: string; webhookPath?: string; }; }

export async function dispatchTrigger(event: TriggerEvent, pgPool: Pool): Promise<void> {
  const result = await pgPool.query<WorkflowRow>(
    'SELECT id, app_id, enabled, trigger FROM workflows WHERE app_id = $1 AND enabled = true',
    [event.appId],
  );
  const matched = result.rows.filter((row) => matchesTrigger(row, event));
  for (const wf of matched) {
    const jobData = { workflowId: wf.id, appId: event.appId, tenantSlug: event.tenantSlug, triggerEvent: event };
    if (process.env.NODE_ENV === 'test') {
      _mockQueue.push(jobData);
    } else {
      if (!_boss) throw new Error('dispatchTrigger: pg-boss not initialised');
      await _boss.send(WORKFLOW_QUEUE, jobData, { retryLimit: 3 });
    }
  }
}

function matchesTrigger(row: WorkflowRow, event: TriggerEvent): boolean {
  const t = row.trigger;
  if (t.type !== event.type) return false;

  if (event.tableApiKey && t.tableApiKey && t.tableApiKey !== event.tableApiKey) {
    return false;
  }

  if (event.type === 'field_changed' && t.fieldApiKey && event.fieldApiKey && t.fieldApiKey !== event.fieldApiKey) {
    return false;
  }

  if (event.type === 'webhook' && t.webhookPath) {
    return t.webhookPath === (event.record?.['path'] as string | undefined);
  }

  if (event.tableApiKey && t.tableApiKey && t.tableApiKey !== event.tableApiKey) return false;
  if (event.type === 'field_changed' && t.fieldApiKey && event.fieldApiKey && t.fieldApiKey !== event.fieldApiKey) return false;
  if (event.type === 'webhook' && t.webhookPath) return t.webhookPath === (event.record?.['path'] as string | undefined);
  return true;
}

export const _mockQueue: unknown[] = [];

export const _test = {
  mockQueue: _mockQueue,
  reset() {
    _mockQueue.length = 0;
  },
};
export const _test = { mockQueue: _mockQueue, reset() { _mockQueue.length = 0; } };
