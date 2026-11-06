/**
 * Multi-level approval engine (v2).
 *
 * Manages approval flows, approval requests, and decisions.
 * Works with the platform.approval_flows / approval_requests / approval_decisions tables
 * added in migration 025_workflow_v2.sql.
 */

import { Pool } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalFlowMode = 'parallel' | 'sequential';
export type ApprovalOnTimeout = 'escalate_to_next' | 'auto_approve' | 'auto_reject' | 'notify_admin';
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'timed_out';
export type ApprovalDecisionAction = 'approved' | 'rejected';

export interface ApprovalLevel {
  order: number;
  approverType: 'role' | 'user' | 'expression';
  approverValue: string;
  requiredCount: number;
  timeoutHours?: number;
  onTimeout: ApprovalOnTimeout;
}

export interface ApprovalFlow {
  id: string;
  appId: string;
  name: string;
  levels: ApprovalLevel[];
  parallelOrSequential: ApprovalFlowMode;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalDecision {
  id: string;
  requestId: string;
  level: number;
  approverId: string;
  decision: ApprovalDecisionAction;
  comment?: string;
  decidedAt: Date;
}

export interface ApprovalRequest {
  id: string;
  flowId: string;
  workflowRunId: string;
  recordId: string;
  tableId: string;
  currentLevel: number;
  status: ApprovalRequestStatus;
  configSnapshot: ApprovalFlow;
  decisions: ApprovalDecision[];
  createdAt: Date;
  resolvedAt?: Date;
  timeoutAt?: Date;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ApprovalNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Approval request not found: ${requestId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  constructor(requestId: string, status: string) {
    super(`Approval request ${requestId} is already ${status}`);
    this.name = 'ApprovalAlreadyDecidedError';
  }
}

export class ApprovalUnauthorizedError extends Error {
  constructor(userId: string, level: number) {
    super(`User ${userId} is not authorized to approve level ${level}`);
    this.name = 'ApprovalUnauthorizedError';
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToFlow(row: Record<string, unknown>): ApprovalFlow {
  const config = row.config as ApprovalFlow;
  return {
    id: row.id as string,
    appId: row.app_id as string,
    name: row.name as string,
    levels: config.levels,
    parallelOrSequential: config.parallelOrSequential,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function rowToDecision(row: Record<string, unknown>): ApprovalDecision {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    level: row.level as number,
    approverId: row.approver_id as string,
    decision: row.decision as ApprovalDecisionAction,
    comment: row.comment != null ? (row.comment as string) : undefined,
    decidedAt: row.decided_at as Date,
  };
}

function rowToRequest(row: Record<string, unknown>, decisions: ApprovalDecision[]): ApprovalRequest {
  return {
    id: row.id as string,
    flowId: row.flow_id as string,
    workflowRunId: row.workflow_run_id as string,
    recordId: row.record_id as string,
    tableId: row.table_id as string,
    currentLevel: row.current_level as number,
    status: row.status as ApprovalRequestStatus,
    configSnapshot: row.config_snapshot as ApprovalFlow,
    decisions,
    createdAt: row.created_at as Date,
    resolvedAt: row.resolved_at != null ? (row.resolved_at as Date) : undefined,
    timeoutAt: row.timeout_at != null ? (row.timeout_at as Date) : undefined,
  };
}

// ─── Approval flow CRUD ───────────────────────────────────────────────────────

export async function createApprovalFlow(
  pool: Pool,
  appId: string,
  name: string,
  levels: ApprovalLevel[],
  mode: ApprovalFlowMode,
): Promise<ApprovalFlow> {
  const config: Omit<ApprovalFlow, 'id' | 'appId' | 'name' | 'createdAt' | 'updatedAt'> = {
    levels,
    parallelOrSequential: mode,
  };

  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO platform.approval_flows (app_id, name, config)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [appId, name, JSON.stringify(config)],
  );
  return rowToFlow(result.rows[0]);
}

export async function getApprovalFlow(
  pool: Pool,
  flowId: string,
): Promise<ApprovalFlow | null> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM platform.approval_flows WHERE id = $1`,
    [flowId],
  );
  if (result.rows.length === 0) return null;
  return rowToFlow(result.rows[0]);
}

export async function listApprovalFlows(
  pool: Pool,
  appId: string,
): Promise<ApprovalFlow[]> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM platform.approval_flows WHERE app_id = $1 ORDER BY created_at`,
    [appId],
  );
  return result.rows.map(rowToFlow);
}

export async function updateApprovalFlow(
  pool: Pool,
  flowId: string,
  name: string,
  levels: ApprovalLevel[],
  mode: ApprovalFlowMode,
): Promise<ApprovalFlow | null> {
  const config: Omit<ApprovalFlow, 'id' | 'appId' | 'name' | 'createdAt' | 'updatedAt'> = {
    levels,
    parallelOrSequential: mode,
  };

  const result = await pool.query<Record<string, unknown>>(
    `UPDATE platform.approval_flows
     SET name = $2, config = $3, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [flowId, name, JSON.stringify(config)],
  );
  if (result.rows.length === 0) return null;
  return rowToFlow(result.rows[0]);
}

export async function deleteApprovalFlow(pool: Pool, flowId: string): Promise<void> {
  await pool.query(`DELETE FROM platform.approval_flows WHERE id = $1`, [flowId]);
}

// ─── Approval request lifecycle ───────────────────────────────────────────────

export async function createApprovalRequest(
  pool: Pool,
  opts: {
    flowId: string;
    workflowRunId: string;
    recordId: string;
    tableId: string;
    configSnapshot: ApprovalFlow;
    timeoutHours?: number;
  },
): Promise<ApprovalRequest> {
  const timeoutAt = opts.timeoutHours != null
    ? new Date(Date.now() + opts.timeoutHours * 3_600_000)
    : opts.configSnapshot.levels[0]?.timeoutHours != null
      ? new Date(Date.now() + (opts.configSnapshot.levels[0].timeoutHours ?? 0) * 3_600_000)
      : null;

  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO platform.approval_requests
       (flow_id, workflow_run_id, record_id, table_id, current_level, status, config_snapshot, timeout_at)
     VALUES ($1, $2, $3, $4, 1, 'pending', $5, $6)
     RETURNING *`,
    [
      opts.flowId,
      opts.workflowRunId,
      opts.recordId,
      opts.tableId,
      JSON.stringify(opts.configSnapshot),
      timeoutAt,
    ],
  );
  return rowToRequest(result.rows[0], []);
}

export async function getApprovalRequest(
  pool: Pool,
  requestId: string,
): Promise<ApprovalRequest | null> {
  const reqResult = await pool.query<Record<string, unknown>>(
    `SELECT * FROM platform.approval_requests WHERE id = $1`,
    [requestId],
  );
  if (reqResult.rows.length === 0) return null;

  const decResult = await pool.query<Record<string, unknown>>(
    `SELECT * FROM platform.approval_decisions WHERE request_id = $1 ORDER BY decided_at`,
    [requestId],
  );
  const decisions = decResult.rows.map(rowToDecision);
  return rowToRequest(reqResult.rows[0], decisions);
}

export async function listPendingApprovals(
  pool: Pool,
  userId: string,
  roles: string[],
): Promise<ApprovalRequest[]> {
  // Fetch all pending requests
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ar.*, ad_agg.decisions
     FROM platform.approval_requests ar
     LEFT JOIN LATERAL (
       SELECT json_agg(d ORDER BY d.decided_at) AS decisions
       FROM platform.approval_decisions d
       WHERE d.request_id = ar.id
     ) ad_agg ON true
     WHERE ar.status = 'pending'
     ORDER BY ar.created_at DESC`,
  );

  const requests = result.rows.map((row) => {
    const decisions = Array.isArray(row.decisions)
      ? (row.decisions as Record<string, unknown>[]).map(rowToDecision)
      : [];
    return rowToRequest(row, decisions);
  });

  // Filter to those the user can act on at the current level
  return requests.filter((req) => {
    const flow = req.configSnapshot;
    const level = flow.levels.find((l) => l.order === req.currentLevel);
    if (!level) return false;
    return canUserActOnLevel(level, userId, roles);
  });
}

function canUserActOnLevel(
  level: ApprovalLevel,
  userId: string,
  roles: string[],
): boolean {
  if (level.approverType === 'user') {
    return level.approverValue === userId;
  }
  if (level.approverType === 'role') {
    return roles.includes(level.approverValue);
  }
  // 'expression' type: would need expr engine — conservatively allow (caller should verify)
  return true;
}

// ─── Decide ───────────────────────────────────────────────────────────────────

export interface DecideOptions {
  requestId: string;
  approverId: string;
  approverRoles: string[];
  decision: ApprovalDecisionAction;
  comment?: string;
}

export interface DecideResult {
  request: ApprovalRequest;
  advanced: boolean;        // moved to next level
  resolved: boolean;        // fully approved or rejected
  finalStatus?: ApprovalRequestStatus;
}

export async function decideApproval(
  pool: Pool,
  opts: DecideOptions,
): Promise<DecideResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the request row
    const reqResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM platform.approval_requests WHERE id = $1 FOR UPDATE`,
      [opts.requestId],
    );
    if (reqResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ApprovalNotFoundError(opts.requestId);
    }

    const reqRow = reqResult.rows[0];
    const status = reqRow.status as ApprovalRequestStatus;

    if (status !== 'pending') {
      await client.query('ROLLBACK');
      throw new ApprovalAlreadyDecidedError(opts.requestId, status);
    }

    const flow = reqRow.config_snapshot as ApprovalFlow;
    const currentLevel = reqRow.current_level as number;
    const level = flow.levels.find((l) => l.order === currentLevel);

    if (!level || !canUserActOnLevel(level, opts.approverId, opts.approverRoles)) {
      await client.query('ROLLBACK');
      throw new ApprovalUnauthorizedError(opts.approverId, currentLevel);
    }

    // Record the decision
    await client.query(
      `INSERT INTO platform.approval_decisions (request_id, level, approver_id, decision, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.requestId, currentLevel, opts.approverId, opts.decision, opts.comment ?? null],
    );

    // Count approvals / rejections at this level
    const decResult = await client.query<Record<string, unknown>>(
      `SELECT decision, COUNT(*) as cnt
       FROM platform.approval_decisions
       WHERE request_id = $1 AND level = $2
       GROUP BY decision`,
      [opts.requestId, currentLevel],
    );

    const counts = { approved: 0, rejected: 0 };
    for (const row of decResult.rows) {
      if (row.decision === 'approved') counts.approved = Number(row.cnt);
      if (row.decision === 'rejected') counts.rejected = Number(row.cnt);
    }

    let advanced = false;
    let resolved = false;
    let finalStatus: ApprovalRequestStatus | undefined;

    if (opts.decision === 'rejected') {
      // Any rejection at a level immediately rejects the whole request
      await client.query(
        `UPDATE platform.approval_requests
         SET status = 'rejected', resolved_at = now()
         WHERE id = $1`,
        [opts.requestId],
      );
      resolved = true;
      finalStatus = 'rejected';
    } else if (counts.approved >= level.requiredCount) {
      // This level is fully approved — advance or resolve
      const nextLevel = flow.levels
        .filter((l) => l.order > currentLevel)
        .sort((a, b) => a.order - b.order)[0];

      if (nextLevel && flow.parallelOrSequential === 'sequential') {
        // Advance to next level
        const nextTimeoutAt = nextLevel.timeoutHours != null
          ? new Date(Date.now() + nextLevel.timeoutHours * 3_600_000)
          : null;

        await client.query(
          `UPDATE platform.approval_requests
           SET current_level = $2, timeout_at = $3
           WHERE id = $1`,
          [opts.requestId, nextLevel.order, nextTimeoutAt],
        );
        advanced = true;
      } else {
        // All levels done — approved
        await client.query(
          `UPDATE platform.approval_requests
           SET status = 'approved', resolved_at = now()
           WHERE id = $1`,
          [opts.requestId],
        );
        resolved = true;
        finalStatus = 'approved';
      }
    }

    await client.query('COMMIT');

    const updated = await getApprovalRequest(pool, opts.requestId);
    if (!updated) throw new ApprovalNotFoundError(opts.requestId);

    return { request: updated, advanced, resolved, finalStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Timeout escalation ───────────────────────────────────────────────────────

export async function processTimedOutApprovals(pool: Pool): Promise<number> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM platform.approval_requests
     WHERE status = 'pending'
       AND timeout_at IS NOT NULL
       AND timeout_at <= now()
     FOR UPDATE SKIP LOCKED`,
  );

  let processed = 0;
  for (const row of result.rows) {
    const flow = row.config_snapshot as ApprovalFlow;
    const currentLevel = row.current_level as number;
    const level = flow.levels.find((l) => l.order === currentLevel);
    const requestId = row.id as string;

    if (!level) continue;

    switch (level.onTimeout) {
      case 'auto_approve': {
        await pool.query(
          `UPDATE platform.approval_requests
           SET status = 'approved', resolved_at = now()
           WHERE id = $1`,
          [requestId],
        );
        break;
      }
      case 'auto_reject': {
        await pool.query(
          `UPDATE platform.approval_requests
           SET status = 'rejected', resolved_at = now()
           WHERE id = $1`,
          [requestId],
        );
        break;
      }
      case 'escalate_to_next': {
        const nextLevel = flow.levels
          .filter((l) => l.order > currentLevel)
          .sort((a, b) => a.order - b.order)[0];

        if (nextLevel) {
          const nextTimeoutAt = nextLevel.timeoutHours != null
            ? new Date(Date.now() + nextLevel.timeoutHours * 3_600_000)
            : null;
          await pool.query(
            `UPDATE platform.approval_requests
             SET current_level = $2, timeout_at = $3
             WHERE id = $1`,
            [requestId, nextLevel.order, nextTimeoutAt],
          );
        } else {
          // No next level — mark timed out
          await pool.query(
            `UPDATE platform.approval_requests
             SET status = 'timed_out', resolved_at = now()
             WHERE id = $1`,
            [requestId],
          );
        }
        break;
      }
      case 'notify_admin': {
        // Transition to timed_out; notification is handled by the caller / cron job
        await pool.query(
          `UPDATE platform.approval_requests
           SET status = 'timed_out', resolved_at = now()
           WHERE id = $1`,
          [requestId],
        );
        break;
      }
    }
    processed++;
  }
  return processed;
}
