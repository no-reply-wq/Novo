/**
 * Approval engine - spec 3.3
 */

import { nanoid } from 'nanoid';
import type {
  ApprovalChainDef,
  ApprovalLevelDef,
  ApprovalDecisionType,
  ApprovalRequestV2,
  ApprovalAction,
  ApprovalDeps,
} from './types';

function rowToRequest(row: Record<string, unknown>): ApprovalRequestV2 {
  return {
    id: row.id as string,
    chainId: row.chain_id as string,
    appId: row.app_id as string,
    tenantSlug: row.tenant_slug as string,
    tableApiKey: row.table_api_key as string,
    recordId: row.record_id as string,
    currentLevel: row.current_level as number,
    status: row.status as ApprovalRequestV2['status'],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function levelForOrder(chain: ApprovalChainDef, order: number): ApprovalLevelDef | undefined {
  return chain.levels.find((l: ApprovalLevelDef) => l.order === order);
}

async function notifyApprovers(
  level: ApprovalLevelDef,
  requestId: string,
  appId: string,
  deps: ApprovalDeps,
): Promise<void> {
  if (!deps.notify) return;
  for (const approver of level.approvers) {
    if (approver.type === 'user' && approver.userId) {
      await deps.notify(approver.userId, { requestId, appId, level: level.order });
    }
  }
}

export async function startApproval(
  chainId: string,
  recordId: string,
  initiatorUserId: string,
  deps: ApprovalDeps,
): Promise<ApprovalRequestV2> {
  const chain = await deps.getChain(chainId);
  if (!chain) throw new Error('Approval chain not found: ' + chainId);

  const firstLevel = chain.levels.slice().sort((a: ApprovalLevelDef, b: ApprovalLevelDef) => a.order - b.order)[0];
  if (!firstLevel) throw new Error('Chain ' + chainId + ' has no levels');

  const id = nanoid();
  const now = new Date().toISOString();

  const { rows } = await deps.db.query<Record<string, unknown>>(
    'INSERT INTO platform.approval_requests (id, chain_id, app_id, tenant_slug, table_api_key, record_id, current_level, status, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,\'pending\',$8,$9,$9) RETURNING *',
    [id, chain.id, chain.appId, '', chain.tableApiKey, recordId, firstLevel.order, initiatorUserId, now],
  );

  const request = rowToRequest(rows[0]);
  await notifyApprovers(firstLevel, id, chain.appId, deps);
  return request;
}

export async function decideApproval(
  requestId: string,
  approverId: string,
  decision: ApprovalDecisionType,
  comment: string | undefined,
  delegateTo: string | undefined,
  deps: ApprovalDeps,
): Promise<{ newStatus: ApprovalRequestV2['status']; advancedToLevel?: number }> {
  const { rows: reqRows } = await deps.db.query<Record<string, unknown>>(
    'SELECT * FROM platform.approval_requests WHERE id = $1',
    [requestId],
  );
  if (reqRows.length === 0) throw new Error('Approval request not found: ' + requestId);
  const request = rowToRequest(reqRows[0]);

  if (request.status !== 'pending' && request.status !== 'escalated') {
    throw new Error('Request ' + requestId + ' is already ' + request.status);
  }

  const chain = await deps.getChain(request.chainId);
  if (!chain) throw new Error('Chain ' + request.chainId + ' not found');

  const currentLevelDef = levelForOrder(chain, request.currentLevel);
  if (!currentLevelDef) throw new Error('Level ' + request.currentLevel + ' not found');

  const actionId = nanoid();
  const now = new Date().toISOString();
  await deps.db.query(
    'INSERT INTO platform.approval_actions (id, request_id, level, approver_id, decision, comment, delegated_to, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [actionId, requestId, request.currentLevel, approverId, decision, comment ?? null, delegateTo ?? null, now],
  );

  if (decision === 'delegated') {
    if (!delegateTo) throw new Error('delegateTo is required for delegation');
    if (deps.notify) {
      await deps.notify(delegateTo, { requestId, appId: chain.appId, level: request.currentLevel });
    }
    return { newStatus: 'pending' };
  }

  if (decision === 'rejected') {
    await deps.db.query(
      "UPDATE platform.approval_requests SET status='rejected', updated_at=$2 WHERE id=$1",
      [requestId, now],
    );
    if (deps.dispatchWorkflowEvent) {
      await deps.dispatchWorkflowEvent(chain.appId, 'approval_decided', {
        requestId, chainId: chain.id, recordId: request.recordId, decision: 'rejected',
      });
    }
    return { newStatus: 'rejected' };
  }

  const quorumMet = await isQuorumMet(requestId, request.currentLevel, currentLevelDef, deps);
  if (!quorumMet) return { newStatus: 'pending' };

  const sortedLevels = chain.levels.slice().sort((a: ApprovalLevelDef, b: ApprovalLevelDef) => a.order - b.order);
  const nextLevel = sortedLevels.find((l: ApprovalLevelDef) => l.order > request.currentLevel);

  if (nextLevel) {
    await deps.db.query(
      "UPDATE platform.approval_requests SET current_level=$2, status='pending', updated_at=$3 WHERE id=$1",
      [requestId, nextLevel.order, now],
    );
    await notifyApprovers(nextLevel, requestId, chain.appId, deps);
    return { newStatus: 'pending', advancedToLevel: nextLevel.order };
  }

  await deps.db.query(
    "UPDATE platform.approval_requests SET status='approved', updated_at=$2 WHERE id=$1",
    [requestId, now],
  );
  if (deps.dispatchWorkflowEvent) {
    await deps.dispatchWorkflowEvent(chain.appId, 'approval_decided', {
      requestId, chainId: chain.id, recordId: request.recordId, decision: 'approved',
    });
  }
  return { newStatus: 'approved' };
}

async function isQuorumMet(
  requestId: string,
  level: number,
  levelDef: ApprovalLevelDef,
  deps: ApprovalDeps,
): Promise<boolean> {
  const { rows } = await deps.db.query<Record<string, unknown>>(
    "SELECT DISTINCT approver_id FROM platform.approval_actions WHERE request_id=$1 AND level=$2 AND decision='approved'",
    [requestId, level],
  );
  const approvalsGiven = rows.length;
  if (levelDef.mode === 'sequential') return approvalsGiven >= 1;
  const required = levelDef.requiredCount !== undefined
    ? levelDef.requiredCount
    : levelDef.approvers.length;
  return approvalsGiven >= required;
}

export async function checkEscalations(deps: ApprovalDeps): Promise<void> {
  const { rows } = await deps.db.query<Record<string, unknown>>(
    "SELECT * FROM platform.approval_requests WHERE status='pending'",
  );
  const now = Date.now();
  for (const row of rows) {
    const request = rowToRequest(row);
    const chain = await deps.getChain(request.chainId);
    if (!chain) continue;
    const levelDef = levelForOrder(chain, request.currentLevel);
    if (!levelDef || !levelDef.escalationHours) continue;
    const hoursSince = (now - request.updatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < levelDef.escalationHours) continue;
    const { rows: actions } = await deps.db.query<Record<string, unknown>>(
      'SELECT id FROM platform.approval_actions WHERE request_id=$1 AND level=$2 LIMIT 1',
      [request.id, request.currentLevel],
    );
    if (actions.length > 0) continue;
    const actionId = nanoid();
    const ts = new Date().toISOString();
    await deps.db.query(
      "INSERT INTO platform.approval_actions (id, request_id, level, approver_id, decision, comment, decided_at) VALUES ($1,$2,$3,'system','escalated','Auto-escalated due to timeout',$4)",
      [actionId, request.id, request.currentLevel, ts],
    );
    await deps.db.query(
      "UPDATE platform.approval_requests SET status='escalated', updated_at=$2 WHERE id=$1",
      [request.id, ts],
    );
    if (levelDef.escalateTo && deps.notify) {
      const esc = levelDef.escalateTo;
      if (esc.type === 'user' && esc.userId) {
        await deps.notify(esc.userId, {
          requestId: request.id, appId: chain.appId, level: request.currentLevel, reason: 'escalation',
        });
      }
    }
  }
}

export type { ApprovalAction };
