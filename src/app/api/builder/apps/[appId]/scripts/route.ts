import { NextRequest, NextResponse } from 'next/server';
import type { ScriptDef } from '@/platform/contracts/rules';

const scriptStore = new Map<string, ScriptDef>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const scripts = Array.from(scriptStore.values()).filter((s) => s.appId === appId);
  return NextResponse.json({ scripts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const body = (await req.json()) as Partial<ScriptDef>;
  const now = new Date();
  const script: ScriptDef = {
    id: `script_${Date.now()}`,
    appId,
    name: body.name ?? 'Untitled script',
    description: body.description,
    language: 'javascript',
    code: body.code ?? '// Script\nasync function main(input, sdk) {\n  return {};\n}\n',
    version: 1,
    testCases: body.testCases ?? [],
    createdAt: now,
    updatedAt: now,
  };
  scriptStore.set(script.id, script);
  return NextResponse.json({ script }, { status: 201 });
}
