/**
 * Runtime API - Decide on approval (spec 3.3)
 * POST /api/runtime/approvals/[requestId]/decide
 */
import { NextRequest, NextResponse } from 'next/server';
import { decideApproval } from '@/platform/approvals/engine';
import type { ApprovalDecisionType, ApprovalDeps } from '@/platform/approvals/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

function buildDeps(): ApprovalDeps {
  return {
    db: {
      query: async <T = Record<string, unknown>>(_sql: string, _params?: unknown[]) => {
        return { rows: [] as T[] };
      },
    },
    getChain: async () => null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  const { requestId } = await params;
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  // Approver identity comes from the authenticated session, never a client header.
  const approverId = ctx.userId;
  const body = (await req.json()) as {
    decision: ApprovalDecisionType;
    comment?: string;
    delegateTo?: string;
  };
  const { decision, comment, delegateTo } = body;
  if (!decision || !['approved', 'rejected', 'delegated'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  }
  if (decision === 'delegated' && !delegateTo) {
    return NextResponse.json({ error: 'delegateTo required for delegation' }, { status: 400 });
  }
  try {
    const result = await decideApproval(requestId, approverId, decision, comment, delegateTo, buildDeps());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
