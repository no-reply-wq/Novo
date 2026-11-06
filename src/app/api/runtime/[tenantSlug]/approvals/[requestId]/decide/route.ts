import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  decideApproval,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalUnauthorizedError,
} from '@/platform/workflows/approvals';
import type { ApprovalDecisionAction } from '@/platform/workflows/approvals';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; requestId: string }> },
) {
  const { requestId } = await params;
  const body = (await req.json()) as {
    approverId: string;
    approverRoles: string[];
    decision: ApprovalDecisionAction;
    comment?: string;
  };

  if (!body.approverId || !body.decision) {
    return NextResponse.json(
      { error: 'approverId and decision are required' },
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
      approverId: body.approverId,
      approverRoles: body.approverRoles ?? [],
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
