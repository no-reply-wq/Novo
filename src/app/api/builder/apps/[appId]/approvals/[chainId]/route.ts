import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import type { ApprovalChainDef } from '@/platform/contracts/rules';

const chainStore = new Map<string, ApprovalChainDef>();

type Params = Promise<{ appId: string; chainId: string }>;

export async function GET(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId, chainId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const chain = chainStore.get(chainId);
  if (!chain) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ chain });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId, chainId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const existing = chainStore.get(chainId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json()) as Partial<ApprovalChainDef>;
  const updated: ApprovalChainDef = {
    ...existing,
    ...body,
    id: existing.id,
    appId: existing.appId,
    updatedAt: new Date(),
  };
  chainStore.set(chainId, updated);
  return NextResponse.json({ chain: updated });
}
