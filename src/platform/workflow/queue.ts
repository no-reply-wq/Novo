/**
 * pg-boss queue integration for workflow execution.
 *
 * In tests, a mock queue is used (no real pg-boss).
 */

import { Pool } from 'pg';

const QUEUE_NAME = 'workflow-run';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowJobData {
  workflowId: string;
  payload: unknown;
  tenantSlug?: string;
}

// ─── Mock queue (used in tests) ───────────────────────────────────────────────

type JobHandler = (job: { data: WorkflowJobData }) => Promise<void>;
const mockHandlers: JobHandler[] = [];
const mockQueue: WorkflowJobData[] = [];

export const _test = {
  mockQueue,
  mockHandlers,
  reset() {
    mockQueue.length = 0;
    mockHandlers.length = 0;
  },
};

// ─── Enqueue ──────────────────────────────────────────────────────────────────

let _boss: BossLike | null = null;

interface BossLike {
  send(queue: string, data: unknown): Promise<string | null>;
  work(queue: string, fn: (job: { data: WorkflowJobData }) => Promise<void>): Promise<string>;
  stop(): Promise<void>;
}

export async function enqueueWorkflow(
  workflowId: string,
  payload: unknown,
  tenantSlug?: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    const job: WorkflowJobData = { workflowId, payload, tenantSlug };
    mockQueue.push(job);
    for (const handler of mockHandlers) {
      await handler({ data: job });
    }
    return;
  }

  if (!_boss) {
    throw new Error('Worker not started — call startWorker first');
  }

  await _boss.send(QUEUE_NAME, { workflowId, payload, tenantSlug });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export async function startWorker(pool: Pool): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    // Register a mock handler
    const { runWorkflow } = await import('./runner');
    mockHandlers.push(async (job) => {
      // Minimal stub — real workflows need a WorkflowDef lookup
      console.log('[workflow-queue-mock] received job', job.data.workflowId);
      void runWorkflow;
    });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PgBoss = require('pg-boss') as new (pool: Pool) => BossLike & {
    start(): Promise<void>;
  };
  const boss = new PgBoss(pool);
  await boss.start();
  _boss = boss;

  await boss.work(QUEUE_NAME, async (job) => {
    const { workflowId, payload } = job.data;
    console.log(`[workflow-queue] processing workflow ${workflowId}`);
    // The caller must have registered a workflow resolver — here we just log.
    // Full integration: load WorkflowDef from DB and call runWorkflow().
    void workflowId;
    void payload;
  });
}

export async function stopWorker(): Promise<void> {
  if (_boss) {
    await _boss.stop();
    _boss = null;
  }
}
