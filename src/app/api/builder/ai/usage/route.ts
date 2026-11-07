/**
 * GET /api/builder/ai/usage
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';

const FREE_PLAN_MONTHLY_LIMIT = 5;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantSlug = ((session.user as Record<string, unknown>).tenantSlug as string) ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });
  const planResult = await pgPool.query<{ plan: string }>(`SELECT plan FROM platform.tenants WHERE slug = $1 LIMIT 1`, [tenantSlug]);
  const plan: string = planResult.rows[0]?.plan ?? 'free';
  const countResult = await pgPool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM platform.ai_usage WHERE tenant_slug = $1 AND operation = 'app_draft' AND created_at >= date_trunc('month', now())`,
    [tenantSlug]);
  const used = parseInt(countResult.rows[0]?.cnt ?? '0', 10);
  return NextResponse.json({ used, limit: plan === 'free' ? FREE_PLAN_MONTHLY_LIMIT : null, plan });
}
