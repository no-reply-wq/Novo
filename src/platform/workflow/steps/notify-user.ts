<<<<<<< HEAD
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from "../types";

export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const userId = (step.config["userId"] as string) ?? ctx.userId;
  const title = step.config["title"] as string;
  const message = step.config["message"] as string;
  const link = step.config["link"] as string | undefined;
  if (!title) throw new Error("notify_user: title is required");
  if (!message) throw new Error("notify_user: message is required");
  await deps.pgPool.query(
    `INSERT INTO platform.notifications (user_id, tenant_slug, title, message, link, created_at, is_read) VALUES ($1, $2, $3, $4, $5, now(), false)`,
    [userId, ctx.tenantSlug, title, message, link ?? null],
  );
  return { output: { userId, title }, logs: [`Notification sent to user ${userId}`] };
=======
import type { StepDef, WorkflowContext, StepResult, WorkflowDeps } from '../types';
export async function executeStep(step: StepDef, ctx: WorkflowContext, deps: WorkflowDeps): Promise<StepResult> {
  const userId = (step.config['userId'] as string) ?? ctx.userId;
  const title = step.config['title'] as string;
  const message = step.config['message'] as string;
  const link = step.config['link'] as string | undefined;
  if (!title) throw new Error('notify_user: title required');
  if (!message) throw new Error('notify_user: message required');
  await deps.pgPool.query('INSERT INTO platform.notifications (user_id, tenant_slug, title, message, link, created_at, is_read) VALUES ($1, $2, $3, $4, $5, now(), false)', [userId, ctx.tenantSlug, title, message, link ?? null]);
  return { output: { userId, title }, logs: [`Notification sent to ${userId}`] };
>>>>>>> 9e8f5e8 (feat(workflow): Agent F — Workflow Engine v2 complete)
}
