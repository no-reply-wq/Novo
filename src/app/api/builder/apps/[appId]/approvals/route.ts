import { NextRequest, NextResponse } from 'next/server';
import type { ApprovalChainDef } from '@/platform/contracts/rules';

const chainStore = new Map<string, ApprovalChainDef>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const chains = Array.from(chainStore.values()).filter((c) => c.appId === appId);
  return NextResponse.json({ chains });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const body = (await req.json()) as Partial<ApprovalChainDef>;
  const now = new Date();
  const chain: ApprovalChainDef = {
    id: `chain_${Date.now()}`,
    appId,
    name: body.name ?? 'Untitled chain',
    tableId: body.tableId ?? '',
    levels: body.levels ?? [],
    onApproved: body.onApproved,
    onRejected: body.onRejected,
    amountFieldId: body.amountFieldId,
    createdAt: now,
    updatedAt: now,
  };
  chainStore.set(chain.id, chain);
  return NextResponse.json({ chain }, { status: 201 });
}
