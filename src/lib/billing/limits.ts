/**
 * Server-side plan limit enforcement.
 * Call checkLimit() before any action that counts toward a plan limit.
 */
import { pgPool } from '@/lib/db/client';
import { getPlan } from './plans';

export class PlanLimitError extends Error {
  constructor(
    public readonly resource: string,
    public readonly limit: number,
    public readonly current: number,
    public readonly plan: string,
  ) {
    super(
      `Plan limit reached: ${resource} (${current}/${limit === -1 ? '∞' : limit}) on ${plan} plan`,
    );
    this.name = 'PlanLimitError';
  }
}

interface TenantPlanInfo {
  plan: string;
  status: string;
  trial_ends_at: Date | null;
}

export async function getTenantPlan(tenantSlug: string): Promise<TenantPlanInfo | null> {
  const result = await pgPool.query<TenantPlanInfo>(
    'SELECT plan, status, trial_ends_at FROM public.tenants WHERE slug = $1 LIMIT 1',
    [tenantSlug],
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  // Auto-downgrade expired trials
  if (row.plan === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) {
    await pgPool.query('UPDATE public.tenants SET plan = $1 WHERE slug = $2', ['free', tenantSlug]);
    row.plan = 'free';
  }
  return row;
}

export async function checkRecordLimit(
  tenantSlug: string,
  schemaName: string,
  _tableSlug: string,
): Promise<void> {
  const planInfo = await getTenantPlan(tenantSlug);
  if (!planInfo) return;
  const plan = getPlan(planInfo.plan);
  if (plan.limits.records === -1) return;

  // Count total records across all custom tables using pg_class statistics
  // Note: reltuples is an estimate but fast — good enough for limit enforcement
  const result = await pgPool.query<{ total: string }>(
    `SELECT COALESCE(SUM(reltuples), 0)::bigint::text AS total
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname LIKE 'ct_%' AND c.relkind = 'r'`,
    [schemaName],
  );
  const current = parseInt(result.rows[0]?.total ?? '0', 10);
  if (current >= plan.limits.records) {
    throw new PlanLimitError('records', plan.limits.records, current, planInfo.plan);
  }
}

export async function checkUserLimit(tenantSlug: string, schemaName: string): Promise<void> {
  const planInfo = await getTenantPlan(tenantSlug);
  if (!planInfo) return;
  const plan = getPlan(planInfo.plan);
  if (plan.limits.users === -1) return;

  const result = await pgPool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM public.tenant_users
     WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = $1 LIMIT 1)
       AND active = true`,
    [tenantSlug],
  );
  const current = parseInt(result.rows[0]?.total ?? '0', 10);
  if (current >= plan.limits.users) {
    throw new PlanLimitError('users', plan.limits.users, current, planInfo.plan);
  }
}

export async function checkAppLimit(tenantSlug: string): Promise<void> {
  const planInfo = await getTenantPlan(tenantSlug);
  if (!planInfo) return;
  const plan = getPlan(planInfo.plan);
  if (plan.limits.apps === -1) return;

  const result = await pgPool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM public.apps WHERE tenant_slug = $1`,
    [tenantSlug],
  );
  const current = parseInt(result.rows[0]?.total ?? '0', 10);
  if (current >= plan.limits.apps) {
    throw new PlanLimitError('apps', plan.limits.apps, current, planInfo.plan);
  }
}
