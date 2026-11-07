/**
 * POST /api/builder/apps/[appId]/workflows/[workflowId]/enable?tenant=...
 * Body: { enabled: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/tenant-session";
import { MODULE } from "@/lib/auth/modules";
import { tenantQuery } from "@/lib/db/client";

type Params = Promise<{ appId: string; workflowId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }): Promise<NextResponse> {
  const { workflowId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get("tenant");
  if (!tenantSlug) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as { enabled?: boolean };
  const enabled = body.enabled ?? true;

  const result = await tenantQuery<{ id: string; enabled: boolean }>(
    ctx.schemaName,
    `UPDATE workflows SET enabled = $2, updated_at = NOW() WHERE id = $1 RETURNING id, enabled`,
    [workflowId, enabled],
  );

  if (result.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, enabled: result.rows[0].enabled });
}
