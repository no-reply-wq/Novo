/**
 * Runtime API - Approval Inbox (spec 3.3)
 * GET /api/runtime/approvals/inbox?userId=...&roles=role1,role2
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ApprovalRequestV2, ApprovalChainDef, ApprovalLevelDef } from '@/platform/approvals/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

const requestStore = new Map<string, ApprovalRequestV2>();
const chainStore = new Map<string, ApprovalChainDef>();

function isApproverAtLevel(userId: string, roles: string[], level: ApprovalLevelDef): boolean {
  return level.approvers.some((a) => {
    if (a.type === 'user') return a.userId === userId;
    if (a.type === 'role') return a.roleId !== undefined && roles.includes(a.roleId);
    return false;
  });
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  // Inbox is scoped to the authenticated user; identity from the session only.
  const userId = ctx.userId;
  const roles = ctx.roleName ? [ctx.roleName] : [];

  const inbox: Array<ApprovalRequestV2 & { chainName: string }> = [];
  for (const request of requestStore.values()) {
    if (request.status !== 'pending') continue;
    const chain = chainStore.get(request.chainId);
    if (!chain) continue;
    const levelDef = chain.levels.find((l: ApprovalLevelDef) => l.order === request.currentLevel);
    if (!levelDef) continue;
    if (isApproverAtLevel(userId, roles, levelDef)) {
      inbox.push({ ...request, chainName: chain.name });
    }
  }
  inbox.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return NextResponse.json({ requests: inbox });
}
