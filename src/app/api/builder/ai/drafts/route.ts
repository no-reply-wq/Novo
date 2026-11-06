/**
 * GET /api/builder/ai/drafts?tenant=slug
 * List AI-generated drafts for a tenant.
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
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: Date;
  updated_at: Date;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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
    `SELECT id, tenant_slug, user_id, description, status,
            prompt_tokens, completion_tokens, created_at, updated_at
     FROM platform.app_generation_drafts
     WHERE tenant_slug = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [tenantSlug]
  );

  return NextResponse.json({ drafts: result.rows });
}
