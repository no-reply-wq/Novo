import { NextRequest, NextResponse } from 'next/server';
import type { WorkflowDef } from '@/platform/contracts/rules';

// Shared store (same module in Next.js dev; prod would use DB)
const workflowStore = new Map<string, WorkflowDef>();

type Params = Promise<{ appId: string; workflowId: string }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const { workflowId } = await params;
  const workflow = workflowStore.get(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ workflow });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { workflowId } = await params;
  const existing = workflowStore.get(workflowId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await req.json()) as Partial<WorkflowDef>;
  const updated: WorkflowDef = {
    ...existing,
    ...body,
    id: existing.id,
    appId: existing.appId,
    updatedAt: new Date(),
  };
  workflowStore.set(workflowId, updated);
  return NextResponse.json({ workflow: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const { workflowId } = await params;
  if (!workflowStore.has(workflowId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  workflowStore.delete(workflowId);
  return NextResponse.json({ ok: true });
}
