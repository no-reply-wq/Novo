/**
 * AI usage tracking and credit management.
 * Free plan: 5 app_draft operations per calendar month. Paid plans: unlimited.
 */

import type { Pool } from 'pg';

export interface AiUsageRecord {
  tenantSlug: string;
  appId?: string;
  userId: string;
  operation: 'app_draft' | 'script_draft' | 'field_suggestion';
  tokensUsed: number;
  model: string;
  createdAt: Date;
}

const FREE_PLAN_MONTHLY_LIMIT = 5;

export async function checkAiCredits(tenantSlug: string, pgPool: Pool): Promise<boolean> {
  const planResult = await pgPool.query<{ plan: string }>(
    `SELECT plan FROM platform.tenants WHERE slug = $1 LIMIT 1`, [tenantSlug]);
  const plan: string = planResult.rows[0]?.plan ?? 'free';
  if (plan !== 'free') return true;
  const countResult = await pgPool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM platform.ai_usage
     WHERE tenant_slug = $1 AND operation = 'app_draft'
       AND created_at >= date_trunc('month', now())`, [tenantSlug]);
  const used = parseInt(countResult.rows[0]?.cnt ?? '0', 10);
  return used < FREE_PLAN_MONTHLY_LIMIT;
}

export async function recordAiUsage(record: AiUsageRecord, pgPool: Pool): Promise<void> {
  await pgPool.query(
    `INSERT INTO platform.ai_usage
       (id, tenant_slug, app_id, user_id, operation, tokens_used, model, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
    [record.tenantSlug, record.appId ?? null, record.userId,
     record.operation, record.tokensUsed, record.model, record.createdAt]);
}
