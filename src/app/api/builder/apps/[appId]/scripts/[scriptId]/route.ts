import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import type { ScriptDef } from '@/platform/contracts/rules';

const scriptStore = new Map<string, ScriptDef>();

type Params = Promise<{ appId: string; scriptId: string }>;

export async function GET(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId, scriptId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const script = scriptStore.get(scriptId);
  if (!script) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ script });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Params },
) {
  const { appId, scriptId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
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
