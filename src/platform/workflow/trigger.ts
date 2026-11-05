/**
 * Workflow trigger router.
 *
 * matchTriggers — returns workflows whose trigger matches the given event.
 * startCronScheduler — starts node-cron jobs for 'schedule' triggers.
 * handleWebhook — returns workflows matching a webhook path.
 */

import { Pool } from 'pg';
import type { WorkflowDef, TriggerEvent } from '@/platform/contracts/rules';

// ─── Trigger matching ─────────────────────────────────────────────────────────

export function matchTriggers(
  workflows: WorkflowDef[],
  event: TriggerEvent,
  payload: unknown,
): WorkflowDef[] {
  return workflows.filter((wf) => {
    if (!wf.enabled) return false;
    const trigger = wf.trigger;
    if (!trigger.enabled) return false;
    if (trigger.event !== event) return false;

    if (event === 'webhook_incoming' && trigger.webhookPath) {
      const p = payload as { path?: string } | null;
      if (p && typeof p === 'object' && 'path' in p) {
        return p.path === trigger.webhookPath;
      }
      return false;
    }

    return true;
  });
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export function handleWebhook(
  path: string,
  payload: unknown,
  workflows: WorkflowDef[],
): WorkflowDef[] {
  return matchTriggers(workflows, 'webhook_incoming', { path, payload });
}

// ─── Cron scheduler ───────────────────────────────────────────────────────────

type CronTask = { stop: () => void };
let scheduledTasks: CronTask[] = [];

export async function startCronScheduler(
  pool: Pool,
  workflows: WorkflowDef[],
): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;

  // Stop previous tasks if any
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks = [];

  // Lazy-require node-cron to avoid issues in environments without it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cron = require('node-cron') as {
    schedule: (expr: string, fn: () => void) => CronTask;
    validate: (expr: string) => boolean;
  };

  const scheduleWorkflows = workflows.filter(
    (wf) => wf.enabled && wf.trigger.enabled && wf.trigger.event === 'schedule' && wf.trigger.cronExpr,
  );

  for (const wf of scheduleWorkflows) {
    const expr = wf.trigger.cronExpr!;
    if (!cron.validate(expr)) {
      console.warn(`[workflow] Invalid cron expression for workflow ${wf.id}: ${expr}`);
      continue;
    }

    const task = cron.schedule(expr, () => {
      // Fire-and-forget: enqueue via pg-boss if available
      void (async () => {
        try {
          const { enqueueWorkflow } = await import('./queue');
          await enqueueWorkflow(wf.id, { _trigger: 'schedule', _pool: pool });
        } catch (err) {
          console.error(`[workflow] Failed to enqueue scheduled workflow ${wf.id}:`, err);
        }
      })();
    });

    scheduledTasks.push(task);
  }
}
