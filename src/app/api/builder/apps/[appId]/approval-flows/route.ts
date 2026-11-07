/**
 * Builder API - Approval Chains (spec 3.3)
 * GET  list chains, POST create chain
 */
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { ApprovalChainDef } from '@/platform/approvals/types';

const store = new Map<string, ApprovalChainDef[]>();
function getAppChains(appId: string): ApprovalChainDef[] {
  if (!store.has(appId)) store.set(appId, []);
  return store.get(appId)!;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  return NextResponse.json({ chains: getAppChains(appId) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const body = (await req.json()) as Omit<ApprovalChainDef, 'id' | 'appId'>;
  const chain: ApprovalChainDef = {
    id: nanoid(),
    appId,
    name: body.name,
    tableApiKey: body.tableApiKey ?? '',
    triggerExpr: body.triggerExpr,
    levels: body.levels ?? [],
  };
  getAppChains(appId).push(chain);
  return NextResponse.json({ chain }, { status: 201 });
}
