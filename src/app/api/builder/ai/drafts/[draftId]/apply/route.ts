/**
 * POST /api/builder/ai/drafts/[draftId]/apply?tenant=slug
 * Apply a reviewed draft to create the real app.
 * Returns: { appId, tablesCreated, pagesCreated }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { applyDraft } from '@/platform/ai/apply-draft';

type RouteContext = { params: Promise<{ draftId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { draftId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = session.user.id ?? session.user.email ?? 'unknown';

  const client = await pgPool.connect();
  try {
    const result = await applyDraft(draftId, tenantSlug, userId, client);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('already been applied')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
