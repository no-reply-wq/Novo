import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool as pool } from '@/lib/db/client';

type Params = Promise<{ appId: string; workflowId: string; runId: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }): Promise<NextResponse> {
  const { workflowId, runId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  void ctx;
  const result = await pool.query('SELECT id, workflow_id, tenant_slug, trigger_event, status, started_at, ended_at, duration_ms, error, run_log AS step_logs FROM public.workflow_runs WHERE id = $1 AND workflow_id = $2 AND tenant_slug = $3', [runId, workflowId, tenantSlug]);
  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run: result.rows[0] });
}
