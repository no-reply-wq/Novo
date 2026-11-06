/**
 * GET /api/builder/billing?tenant=slug
 * Returns current tenant plan info + limits for the builder UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { getPlan } from '@/lib/billing/plans';
import { getTenantPlan } from '@/lib/billing/limits';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantSlug = req.nextUrl.searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  // Verify the requesting user belongs to this tenant (or is platform admin)
  const isPlatformAdmin = session.user.isPlatformAdmin ?? false;
  const userTenantSlug = session.user.tenantSlug ?? '';
  if (!isPlatformAdmin && userTenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await pgPool.query<{
    plan: string;
    status: string;
    trial_ends_at: Date | null;
    created_at: Date;
  }>(
    'SELECT plan, status, trial_ends_at, created_at FROM public.tenants WHERE slug = $1 LIMIT 1',
    [tenantSlug],
  );

  if (!result.rows.length) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const tenantRow = result.rows[0];

  // getTenantPlan handles auto-downgrade of expired trials
  const planInfo = await getTenantPlan(tenantSlug);
  const effectivePlanName = planInfo?.plan ?? tenantRow.plan;
  const plan = getPlan(effectivePlanName);

  return NextResponse.json({
    currentPlan: plan,
    status: tenantRow.status,
    trialEndsAt: tenantRow.trial_ends_at,
    createdAt: tenantRow.created_at,
  });
}
