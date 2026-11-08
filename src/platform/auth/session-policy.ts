/**
 * Platform Auth — Session Policy (spec: gap-agent-w1-auth feature 2)
 *
 * Stored in platform.tenant_settings as a JSON blob under key 'session_policy'.
 * Enforcement is called per request; returns false when the session should be
 * invalidated.
 */

import { Pool } from 'pg';

export interface SessionPolicy {
  maxSessionDurationHours: number;  // default 8
  idleTimeoutMinutes: number;       // default 60
  maxConcurrentSessions: number;    // default 5
  requireReauthForSensitive: boolean;
}

const DEFAULT_POLICY: SessionPolicy = {
  maxSessionDurationHours: 8,
  idleTimeoutMinutes: 60,
  maxConcurrentSessions: 5,
  requireReauthForSensitive: false,
};

/** Fetch the session policy for a tenant, falling back to defaults. */
export async function getSessionPolicy(
  tenantSlug: string,
  pgPool: Pool,
): Promise<SessionPolicy> {
  try {
    const { rows } = await pgPool.query<{ value: SessionPolicy }>(
      `SELECT value FROM platform.tenant_settings WHERE tenant_slug = $1 AND key = 'session_policy' LIMIT 1`,
      [tenantSlug],
    );
    if (rows.length === 0 || !rows[0].value) return { ...DEFAULT_POLICY };
    return { ...DEFAULT_POLICY, ...rows[0].value };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

/** Persist (upsert) the session policy for a tenant. */
export async function saveSessionPolicy(
  tenantSlug: string,
  policy: SessionPolicy,
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(
    `INSERT INTO platform.tenant_settings (tenant_slug, key, value)
     VALUES ($1, 'session_policy', $2::jsonb)
     ON CONFLICT (tenant_slug, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [tenantSlug, JSON.stringify(policy)],
  );
}

/**
 * Enforce the session policy for a session token.
 *
 * Checks:
 *   1. Session exists and has not exceeded maxSessionDurationHours.
 *   2. Last activity is within idleTimeoutMinutes.
 *   3. Total active sessions for the user is <= maxConcurrentSessions.
 *
 * Returns true when the session is valid, false when it should be terminated.
 */
export async function enforceSessionPolicy(
  sessionToken: string,
  pgPool: Pool,
): Promise<boolean> {
  try {
    const { rows } = await pgPool.query<{
      tenant_slug: string;
      user_id: string;
      created_at: Date;
      last_active_at: Date;
    }>(
      `SELECT tenant_slug, user_id, created_at, last_active_at
       FROM platform.user_sessions
       WHERE session_token = $1 AND revoked = false
       LIMIT 1`,
      [sessionToken],
    );

    if (rows.length === 0) return false;

    const session = rows[0];
    const policy = await getSessionPolicy(session.tenant_slug, pgPool);
    const now = new Date();

    // 1. Max session duration
    const sessionAgeHours = (now.getTime() - session.created_at.getTime()) / (1000 * 60 * 60);
    if (sessionAgeHours > policy.maxSessionDurationHours) return false;

    // 2. Idle timeout
    const idleMinutes = (now.getTime() - session.last_active_at.getTime()) / (1000 * 60);
    if (idleMinutes > policy.idleTimeoutMinutes) return false;

    // 3. Max concurrent sessions
    const { rows: concurrentRows } = await pgPool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM platform.user_sessions
       WHERE user_id = $1 AND revoked = false AND tenant_slug = $2`,
      [session.user_id, session.tenant_slug],
    );
    const concurrent = parseInt(concurrentRows[0]?.count ?? '0', 10);
    if (concurrent > policy.maxConcurrentSessions) return false;

    return true;
  } catch {
    // On DB error, fail open (don't lock users out due to infrastructure issue)
    return true;
  }
}
