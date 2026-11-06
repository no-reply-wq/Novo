/**
 * POST /api/builder/ai/generate
 * Body: { description: string, tenant: string }
 * Returns: GeneratedAppDraft
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { z } from 'zod';
import { generateApp } from '@/platform/ai/app-generator';
import { NotConfiguredError } from '@/platform/workflow/errors';

const GenerateSchema = z.object({
  description: z.string().min(10).max(2000),
  tenant: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { description, tenant: tenantSlug } = parsed.data;

  // Tenant-scope check
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = session.user.id ?? session.user.email ?? 'unknown';

  try {
    const draft = await generateApp({ description, tenantSlug, userId });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json(
        { error: 'AI generation is not configured on this server' },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
