/**
 * Workflow schedule manager — pg-boss cron job registration.
 */

interface BossLike {
  schedule(name: string, cron: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<void>;
  unschedule(name: string): Promise<void>;
}

function jobName(appId: string, workflowId: string): string {
  return `workflow-schedule:${appId}:${workflowId}`;
}

interface ScheduledWorkflow {
  id: string;
  appId: string;
  tenantSlug: string;
  cronExpr: string;
}

export async function registerSchedule(boss: BossLike, workflow: ScheduledWorkflow): Promise<void> {
  await boss.schedule(
    jobName(workflow.appId, workflow.id),
    workflow.cronExpr,
    { workflowId: workflow.id, appId: workflow.appId, tenantSlug: workflow.tenantSlug, triggerEvent: { type: "schedule" } },
    { tz: "UTC" },
  );
}

export async function unregisterSchedule(boss: BossLike, appId: string, workflowId: string): Promise<void> {
  try { await boss.unschedule(jobName(appId, workflowId)); } catch { /* ignore */ }
}

export async function syncSchedules(
  boss: BossLike, appId: string, tenantSlug: string,
  workflows: ScheduledWorkflow[], allWorkflowIds: string[],
): Promise<void> {
  const activeIds = new Set(workflows.map((w) => w.id));
  for (const id of allWorkflowIds) {
    if (!activeIds.has(id)) await unregisterSchedule(boss, appId, id);
  }
  for (const wf of workflows) {
    await registerSchedule(boss, { ...wf, appId, tenantSlug });
  }
}
