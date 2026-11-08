/**
 * Tests for src/platform/auth/session-policy.ts
 *
 * Uses in-memory mocks for the pg Pool to avoid a real DB dependency.
 */

import {
  getSessionPolicy,
  saveSessionPolicy,
  enforceSessionPolicy,
  type SessionPolicy,
} from '@/platform/auth/session-policy';
import { Pool } from 'pg';

// Minimal pg Pool mock
function makePool(queryFn: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>): Pool {
  return {
    query: queryFn,
  } as unknown as Pool;
}

const DEFAULT_POLICY: SessionPolicy = {
  maxSessionDurationHours: 8,
  idleTimeoutMinutes: 60,
  maxConcurrentSessions: 5,
  requireReauthForSensitive: false,
};

describe('Session Policy — platform/auth/session-policy', () => {
  describe('getSessionPolicy()', () => {
    it('returns default policy when no row exists', async () => {
      const pool = makePool(async () => ({ rows: [] }));
      const policy = await getSessionPolicy('acme', pool);
      expect(policy).toEqual(DEFAULT_POLICY);
    });

    it('merges saved values over defaults', async () => {
      const saved = { maxSessionDurationHours: 4, idleTimeoutMinutes: 30 };
      const pool = makePool(async () => ({ rows: [{ value: saved }] }));
      const policy = await getSessionPolicy('acme', pool);
      expect(policy.maxSessionDurationHours).toBe(4);
      expect(policy.idleTimeoutMinutes).toBe(30);
      // unchanged defaults
      expect(policy.maxConcurrentSessions).toBe(5);
    });

    it('returns defaults on DB error', async () => {
      const pool = makePool(async () => { throw new Error('DB down'); });
      const policy = await getSessionPolicy('acme', pool);
      expect(policy).toEqual(DEFAULT_POLICY);
    });
  });

  describe('saveSessionPolicy()', () => {
    it('calls pool.query with upsert SQL and serialised policy', async () => {
      const calls: Array<{ text: string; values: unknown[] }> = [];
      const pool = makePool(async (text, values = []) => {
        calls.push({ text, values });
        return { rows: [] };
      });
      const policy: SessionPolicy = { ...DEFAULT_POLICY, maxSessionDurationHours: 2 };
      await saveSessionPolicy('acme', policy, pool);
      expect(calls).toHaveLength(1);
      expect(calls[0].text).toMatch(/INSERT INTO platform\.tenant_settings/);
      expect(calls[0].values[0]).toBe('acme');
      expect(calls[0].values[1]).toContain('"maxSessionDurationHours":2');
    });
  });

  describe('enforceSessionPolicy()', () => {
    it('returns false when no session row exists', async () => {
      const pool = makePool(async () => ({ rows: [] }));
      const result = await enforceSessionPolicy('tok-nonexistent', pool);
      expect(result).toBe(false);
    });

    it('returns false when session exceeds max duration', async () => {
      const createdAt = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10h ago
      const lastActiveAt = new Date(Date.now() - 1 * 60 * 1000);    // 1 min ago
      let callIndex = 0;
      const pool = makePool(async () => {
        callIndex++;
        if (callIndex === 1) {
          // user_sessions query
          return { rows: [{ tenant_slug: 'acme', user_id: 'u1', created_at: createdAt, last_active_at: lastActiveAt }] };
        }
        // tenant_settings query
        return { rows: [] };
      });
      const result = await enforceSessionPolicy('tok', pool);
      expect(result).toBe(false);
    });

    it('returns false when session is idle too long', async () => {
      const createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000);   // 1h ago
      const lastActiveAt = new Date(Date.now() - 90 * 60 * 1000);    // 90 min ago
      let callIndex = 0;
      const pool = makePool(async () => {
        callIndex++;
        if (callIndex === 1) {
          return { rows: [{ tenant_slug: 'acme', user_id: 'u1', created_at: createdAt, last_active_at: lastActiveAt }] };
        }
        return { rows: [] }; // default policy (idle=60)
      });
      const result = await enforceSessionPolicy('tok', pool);
      expect(result).toBe(false);
    });

    it('returns true for a valid, fresh session', async () => {
      const createdAt = new Date(Date.now() - 30 * 60 * 1000);   // 30 min ago
      const lastActiveAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      let callIndex = 0;
      const pool = makePool(async () => {
        callIndex++;
        if (callIndex === 1) {
          return { rows: [{ tenant_slug: 'acme', user_id: 'u1', created_at: createdAt, last_active_at: lastActiveAt }] };
        }
        if (callIndex === 2) {
          // tenant_settings
          return { rows: [] };
        }
        // concurrent sessions count
        return { rows: [{ count: '2' }] };
      });
      const result = await enforceSessionPolicy('tok', pool);
      expect(result).toBe(true);
    });
  });
});
