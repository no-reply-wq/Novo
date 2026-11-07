/**
 * POST /api/builder/ai/generate-script
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { z } from 'zod';
import { pgPool } from '@/lib/db/client';
import { generateScriptDraft } from '@/platform/ai/generator';
import { recordAiUsage } from '@/platform/ai/credits';

const Schema = z.object({ description: z.string().min(5).max(1000), tableContext: z.array(z.string()).default([]) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantSlug = ((session.user as Record<string, unknown>).tenantSlug as string) ?? '';
  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) return NextResponse.json({ error: 'AI generation requires OPENAI_API_KEY to be configured' }, { status: 503 });
  const userId = ((session.user as Record<string, unknown>).id as string) ?? session.user.email ?? 'unknown';
  try {
    const result = await generateScriptDraft(parsed.data.description, parsed.data.tableContext, openAiKey);
    await recordAiUsage({ tenantSlug: tenantSlug || 'unknown', userId, operation: 'script_draft', tokensUsed: 0, model: 'gpt-4o-mini', createdAt: new Date() }, pgPool);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
