/**
 * Notification trigger helpers — Agent W2
 * Wire sendNotification into the approval engine and workflow runner.
 */

import type { Pool } from 'pg';
import { sendNotification } from './service';

/**
 * Build an ApprovalDeps-compatible `notify` callback that persists
 * in-app notifications for each user.
 *
 * @param tenantSlug  Tenant this approval belongs to
 * @param pgPool      Postgres pool for the platform schema
 */
export function makeApprovalNotifier(
  tenantSlug: string,
  pgPool: Pool,
): (userId: string, payload: Record<string, unknown>) => Promise<void> {
  return async (userId, payload) => {
    const requestId = payload.requestId as string | undefined;
    const appId = payload.appId as string | undefined;
    const reason = payload.reason as string | undefined;

    const isEscalation = reason === 'escalation';
    const type = isEscalation ? 'approval_requested' : 'approval_requested';

    await sendNotification(
      {
        tenantSlug,
        recipientUserId: userId,
        type,
        title: isEscalation ? 'Approval Escalated' : 'Approval Required',
        body: isEscalation
          ? `An approval request (${requestId}) has been escalated to you.`
          : `An approval request (${requestId}) requires your decision.`,
        link: appId && requestId
          ? `/builder/apps/${appId}/approvals/${requestId}`
          : undefined,
        appId: appId ?? undefined,
        recordId: requestId ?? undefined,
      },
      pgPool,
    );
  };
}

/**
 * Send an approval_decided notification to the initiator.
 */
export async function notifyApprovalDecided(opts: {
  tenantSlug: string;
  recipientUserId: string;
  requestId: string;
  appId: string;
  recordId: string;
  decision: 'approved' | 'rejected';
  pgPool: Pool;
}): Promise<void> {
  await sendNotification(
    {
      tenantSlug: opts.tenantSlug,
      recipientUserId: opts.recipientUserId,
      type: 'approval_decided',
      title: opts.decision === 'approved' ? 'Approval Granted' : 'Approval Rejected',
      body: `Your approval request has been ${opts.decision}.`,
      link: `/builder/apps/${opts.appId}/approvals/${opts.requestId}`,
      appId: opts.appId,
      recordId: opts.recordId,
    },
    opts.pgPool,
  );
}

/**
 * Send a workflow_failed notification.
 */
export async function notifyWorkflowFailed(opts: {
  tenantSlug: string;
  recipientUserId: string;
  workflowId: string;
  workflowName: string;
  appId: string;
  errorMessage?: string;
  pgPool: Pool;
}): Promise<void> {
  await sendNotification(
    {
      tenantSlug: opts.tenantSlug,
      recipientUserId: opts.recipientUserId,
      type: 'workflow_failed',
      title: 'Workflow Failed',
      body: `Workflow "${opts.workflowName}" failed${opts.errorMessage ? ': ' + opts.errorMessage : '.'}`,
      link: `/builder/apps/${opts.appId}/workflows/${opts.workflowId}`,
      appId: opts.appId,
    },
    opts.pgPool,
  );
}
