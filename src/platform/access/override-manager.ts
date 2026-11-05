/**
 * override-manager.ts
 *
 * Per-user access override storage and lookup.
 * Overrides sit on top of role-based policies; they can grant or revoke
 * access for specific users, optionally with an expiry time.
 */

import type { UserOverride } from '@/platform/contracts';
import type { PgClient } from './location-manager';

export class OverrideManager {
  constructor(private readonly db: PgClient) {}

  /** Create or replace a user override */
  async upsertOverride(
    override: Omit<UserOverride, 'createdAt' | 'updatedAt'>,
  ): Promise<UserOverride> {
    const { rows } = await this.db.query<{
      id: string;
      user_id: string;
      table_id: string;
      override_type: 'grant' | 'revoke';
      operation: string;
      condition: string | null;
      expires_at: Date | null;
      reason: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO public.user_overrides
         (id, user_id, table_id, override_type, operation, condition, expires_at, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         override_type = EXCLUDED.override_type,
         operation     = EXCLUDED.operation,
         condition     = EXCLUDED.condition,
         expires_at    = EXCLUDED.expires_at,
         reason        = EXCLUDED.reason,
         updated_at    = NOW()
       RETURNING *`,
      [
        override.id,
        override.userId,
        override.tableId,
        override.overrideType,
        override.operation,
        override.condition ?? null,
        override.expiresAt ?? null,
        override.reason ?? null,
      ],
    );
    return rowToUserOverride(rows[0]);
  }

  /**
   * Get all ACTIVE (non-expired) overrides for a user on a given table.
   * Expired overrides are excluded — expiry is enforced here, not just at policy time.
   */
  async getActiveOverrides(
    userId: string,
    tableId: string,
    now: Date = new Date(),
  ): Promise<UserOverride[]> {
    const { rows } = await this.db.query<{
      id: string;
      user_id: string;
      table_id: string;
      override_type: 'grant' | 'revoke';
      operation: string;
      condition: string | null;
      expires_at: Date | null;
      reason: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM public.user_overrides
       WHERE user_id = $1
         AND table_id = $2
         AND (expires_at IS NULL OR expires_at > $3)
       ORDER BY created_at`,
      [userId, tableId, now],
    );
    return rows.map(rowToUserOverride);
  }

  /**
   * Check whether a specific override is still active (not expired).
   */
  async isOverrideActive(overrideId: string, now: Date = new Date()): Promise<boolean> {
    const { rows } = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM public.user_overrides
       WHERE id = $1 AND (expires_at IS NULL OR expires_at > $2)`,
      [overrideId, now],
    );
    return parseInt(rows[0].count, 10) > 0;
  }

  /** Delete a specific override */
  async deleteOverride(id: string): Promise<void> {
    await this.db.query(`DELETE FROM public.user_overrides WHERE id = $1`, [id]);
  }

  /** Remove all expired overrides (housekeeping) */
  async purgeExpiredOverrides(now: Date = new Date()): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM public.user_overrides
         WHERE expires_at IS NOT NULL AND expires_at <= $1
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [now],
    );
    return parseInt(rows[0].count, 10);
  }
}

function rowToUserOverride(row: {
  id: string;
  user_id: string;
  table_id: string;
  override_type: 'grant' | 'revoke';
  operation: string;
  condition: string | null;
  expires_at: Date | null;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}): UserOverride {
  return {
    id: row.id,
    userId: row.user_id,
    tableId: row.table_id,
    overrideType: row.override_type,
    operation: row.operation as UserOverride['operation'],
    condition: row.condition ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
