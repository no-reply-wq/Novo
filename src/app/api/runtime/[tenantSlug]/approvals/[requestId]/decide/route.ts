import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  decideApproval,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalUnauthorizedError,
} from '@/platform/workflows/approvals';
import type { ApprovalDecisionAction } from '@/platform/workflows/approvals';
import { requireTenantSession } from '@/lib/auth/tenant-session';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; requestId: string }> },
) {
  const { tenantSlug, requestId } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as {
    approverRoles?: string[];
    decision: ApprovalDecisionAction;
    comment?: string;
  };

  // Approver identity comes from the authenticated session, never the client.
  const approverId = ctx.userId;
  const approverRoles = ctx.roleName ? [ctx.roleName] : (body.approverRoles ?? []);

  if (!body.decision) {
    return NextResponse.json(
      { error: 'decision is required' },
      { status: 400 },
    );
  }

  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return NextResponse.json(
      { error: 'decision must be "approved" or "rejected"' },
      { status: 400 },
    );
  }

  const pool = getPool();
  try {
    const result = await decideApproval(pool, {
      requestId,
      approverId,
      approverRoles,
      decision: body.decision,
      comment: body.comment,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApprovalNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ApprovalAlreadyDecidedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ApprovalUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  } finally {
    await pool.end();
  }
}
