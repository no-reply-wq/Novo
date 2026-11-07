/**
 * POST /api/builder/ai/generate-app
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { z } from 'zod';
import { pgPool } from '@/lib/db/client';
import { generateAppDraft, getLastTokenUsage } from '@/platform/ai/generator';
import { checkAiCredits, recordAiUsage } from '@/platform/ai/credits';

const GenerateAppSchema = z.object({
  description: z.string().min(10).max(2000),
  industry: z.string().optional(),
  existingTables: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantSlug = ((session.user as Record<string, unknown>).tenantSlug as string) ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });

  const hasCredits = await checkAiCredits(tenantSlug, pgPool);
  if (!hasCredits) return NextResponse.json({ error: 'Monthly AI generation limit reached. Upgrade your plan for unlimited access.' }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = GenerateAppSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) return NextResponse.json({ error: 'AI generation requires OPENAI_API_KEY to be configured' }, { status: 503 });

  const userId = ((session.user as Record<string, unknown>).id as string) ?? session.user.email ?? 'unknown';
  try {
    const draft = await generateAppDraft(parsed.data, openAiKey);
    const usage = getLastTokenUsage();
    await recordAiUsage({ tenantSlug, userId, operation: 'app_draft', tokensUsed: usage.totalTokens, model: 'gpt-4o-mini', createdAt: new Date() }, pgPool);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
