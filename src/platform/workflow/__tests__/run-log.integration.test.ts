/**
 * Integration test for workflow run logging.
 * Skips gracefully if TEST_DATABASE_URL is not set.
 */

import { Pool } from 'pg';
import { logWorkflowRun } from '../run-log';
import type { WorkflowRunResult } from '../runner';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const describeIntegration = TEST_DB_URL ? describe : describe.skip;

describeIntegration('logWorkflowRun (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.workflow_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id TEXT NOT NULL,
        tenant_slug TEXT NOT NULL,
        trigger_event TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success','failure','timeout','loop_error')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        duration_ms INT,
        error TEXT,
        run_log JSONB NOT NULL DEFAULT '[]'
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.workflow_run_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
        action_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        duration_ms INT,
        output JSONB,
        error TEXT
      )
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('writes a run record and log entries', async () => {
    const now = new Date();
    const run: WorkflowRunResult = {
      status: 'success',
      triggerEvent: 'button_clicked',
      workflowId: 'wf-integration-test',
      startedAt: now,
      endedAt: new Date(now.getTime() + 100),
      durationMs: 100,
      logs: [
        {
          actionId: 'a1',
          actionType: 'set_variable',
          status: 'success',
          startedAt: now,
          durationMs: 10,
          output: { x: 1 },
        },
      ],
    };

    await logWorkflowRun(pool, 'test-tenant', run);

    const runsResult = await pool.query(
      `SELECT * FROM public.workflow_runs WHERE workflow_id = $1`,
      ['wf-integration-test'],
    );
    expect(runsResult.rows).toHaveLength(1);
    expect(runsResult.rows[0].status).toBe('success');
    expect(runsResult.rows[0].tenant_slug).toBe('test-tenant');

    const runId = runsResult.rows[0].id as string;
    const logsResult = await pool.query(
      `SELECT * FROM public.workflow_run_logs WHERE run_id = $1`,
      [runId],
    );
    expect(logsResult.rows).toHaveLength(1);
    expect(logsResult.rows[0].action_id).toBe('a1');
    expect(logsResult.rows[0].status).toBe('success');

    // Cleanup
    await pool.query(`DELETE FROM public.workflow_runs WHERE id = $1`, [runId]);
  });

  it('writes failure status and error message', async () => {
    const now = new Date();
    const run: WorkflowRunResult = {
      status: 'failure',
      triggerEvent: 'record_created',
      workflowId: 'wf-integration-fail',
      startedAt: now,
      endedAt: new Date(now.getTime() + 50),
      durationMs: 50,
      logs: [],
      error: 'Something went wrong',
    };

    await logWorkflowRun(pool, 'test-tenant', run);

    const result = await pool.query(
      `SELECT * FROM public.workflow_runs WHERE workflow_id = $1`,
      ['wf-integration-fail'],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('failure');
    expect(result.rows[0].error).toBe('Something went wrong');

    await pool.query(`DELETE FROM public.workflow_runs WHERE id = $1`, [result.rows[0].id]);
  });
});
