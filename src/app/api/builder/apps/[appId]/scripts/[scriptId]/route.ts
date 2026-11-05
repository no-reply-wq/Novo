import { NextRequest, NextResponse } from 'next/server';
import type { ScriptDef } from '@/platform/contracts/rules';

const scriptStore = new Map<string, ScriptDef>();

type Params = Promise<{ appId: string; scriptId: string }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const { scriptId } = await params;
  const script = scriptStore.get(scriptId);
  if (!script) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ script });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { scriptId } = await params;
  const existing = scriptStore.get(scriptId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json()) as Partial<ScriptDef>;
  const updated: ScriptDef = {
    ...existing,
    ...body,
    id: existing.id,
    appId: existing.appId,
    version: existing.version + 1,
    updatedAt: new Date(),
  };
  scriptStore.set(scriptId, updated);
  return NextResponse.json({ script: updated });
}
