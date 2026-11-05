/**
 * Workflow run log persistence.
 *
 * Writes WorkflowRunResult to public.workflow_runs and
 * per-action entries to public.workflow_run_logs.
 */

import { Pool } from 'pg';
import type { WorkflowRunResult } from './runner';

export async function logWorkflowRun(
  pool: Pool,
  tenantSlug: string,
  run: WorkflowRunResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const runRes = await client.query<{ id: string }>(
      `INSERT INTO public.workflow_runs
         (workflow_id, tenant_slug, trigger_event, status,
          started_at, ended_at, duration_ms, error, run_log)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        run.workflowId,
        tenantSlug,
        run.triggerEvent,
        run.status,
        run.startedAt,
        run.endedAt,
        run.durationMs,
        run.error ?? null,
        JSON.stringify(run.logs),
      ],
    );

    const runId = runRes.rows[0].id;

    for (const entry of run.logs) {
      await client.query(
        `INSERT INTO public.workflow_run_logs
           (run_id, action_id, action_type, status,
            started_at, duration_ms, output, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          runId,
          entry.actionId,
          entry.actionType,
          entry.status,
          entry.startedAt,
          entry.durationMs,
          entry.output != null ? JSON.stringify(entry.output) : null,
          entry.error ?? null,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
