/**
 * GET  /api/builder/ai/drafts/[draftId]?tenant=slug — fetch a single draft
 * DELETE /api/builder/ai/drafts/[draftId]?tenant=slug — delete a draft
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';

interface DraftRow {
  id: string;
  tenant_slug: string;
  user_id: string;
  description: string;
  status: string;
  draft: unknown;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: Date;
  updated_at: Date;
}

type RouteContext = { params: Promise<{ draftId: string }> };

async function authorize(
  req: NextRequest,
  draftId: string
): Promise<{ tenantSlug: string; row: DraftRow } | NextResponse> {
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

  const result = await pgPool.query<DraftRow>(
    `SELECT * FROM platform.app_generation_drafts WHERE id = $1 AND tenant_slug = $2`,
    [draftId, tenantSlug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  return { tenantSlug, row: result.rows[0] };
}

export async function GET(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { draftId } = await params;
  const auth = await authorize(req, draftId);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ draft: auth.row });
}

export async function DELETE(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { draftId } = await params;
  const auth = await authorize(req, draftId);
  if (auth instanceof NextResponse) return auth;

  await pgPool.query(
    `DELETE FROM platform.app_generation_drafts WHERE id = $1`,
    [draftId]
  );

  return NextResponse.json({ deleted: true });
}
