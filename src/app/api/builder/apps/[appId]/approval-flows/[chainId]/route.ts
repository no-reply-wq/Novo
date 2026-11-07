/**
 * Builder API - single Approval Chain (spec 3.3)
 * PUT    update
 * DELETE delete
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ApprovalChainDef } from '@/platform/approvals/types';

const store = new Map<string, ApprovalChainDef[]>();
function getAppChains(appId: string): ApprovalChainDef[] {
  if (!store.has(appId)) store.set(appId, []);
  return store.get(appId)!;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; chainId: string }> },
): Promise<NextResponse> {
  const { appId, chainId } = await params;
  const chains = getAppChains(appId);
  const idx = chains.findIndex((c) => c.id === chainId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json()) as Partial<ApprovalChainDef>;
  chains[idx] = { ...chains[idx], ...body, id: chainId, appId };
  return NextResponse.json({ chain: chains[idx] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; chainId: string }> },
): Promise<NextResponse> {
  const { appId, chainId } = await params;
  const chains = getAppChains(appId);
  const idx = chains.findIndex((c) => c.id === chainId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  chains.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
