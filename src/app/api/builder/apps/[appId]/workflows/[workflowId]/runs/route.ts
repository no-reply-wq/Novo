/**
 * GET /api/builder/apps/[appId]/workflows/[workflowId]/runs?tenant=...
 * Returns the last 100 runs for a workflow.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/tenant-session";
import { MODULE } from "@/lib/auth/modules";
import { pgPool as pool } from "@/lib/db/client";

type Params = Promise<{ appId: string; workflowId: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }): Promise<NextResponse> {
  const { workflowId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get("tenant");
  if (!tenantSlug) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, "view");
  if (ctx instanceof NextResponse) return ctx;

  void ctx;

  const result = await pool.query(
    `SELECT id, workflow_id, tenant_slug, trigger_event, status,
            started_at, ended_at, duration_ms, error
     FROM public.workflow_runs
     WHERE workflow_id = $1 AND tenant_slug = $2
     ORDER BY started_at DESC
     LIMIT 100`,
    [workflowId, tenantSlug],
  );

  return NextResponse.json({ runs: result.rows });
}
