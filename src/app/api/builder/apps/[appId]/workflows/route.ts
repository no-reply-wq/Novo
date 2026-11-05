import { NextRequest, NextResponse } from 'next/server';
import type { WorkflowDef, TriggerDef } from '@/platform/contracts/rules';

// In-memory stub for development/testing until a DB is wired
// Production would use tenantQuery from @/lib/db/client
const workflowStore = new Map<string, WorkflowDef>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const workflows = Array.from(workflowStore.values()).filter((w) => w.appId === appId);
  return NextResponse.json({ workflows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const body = (await req.json()) as { name: string; description?: string };

  const now = new Date();
  const trigger: TriggerDef = {
    id: `trig_${Date.now()}`,
    workflowId: '',
    event: 'record_created',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  const workflow: WorkflowDef = {
    id: `wf_${Date.now()}`,
    appId,
    name: body.name,
    description: body.description,
    trigger,
    actions: [],
    enabled: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  trigger.workflowId = workflow.id;

  workflowStore.set(workflow.id, workflow);
  return NextResponse.json({ workflow }, { status: 201 });
}
