/**
 * Tests for src/platform/ai/credits.ts
 */

import { checkAiCredits, recordAiUsage } from '@/platform/ai/credits';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockPool(planRow: { plan: string } | null, usageCount: number): any {
  const mockQuery = jest.fn()
    .mockResolvedValueOnce({ rows: planRow ? [planRow] : [] })
    .mockResolvedValueOnce({ rows: [{ cnt: String(usageCount) }] });
  return { query: mockQuery };
}

describe('checkAiCredits', () => {
  test('returns true for paid plan without checking count', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = { query: jest.fn().mockResolvedValueOnce({ rows: [{ plan: 'pro' }] }) };
    const result = await checkAiCredits('acme', pool);
    expect(result).toBe(true);
    expect(pool.query.mock.calls).toHaveLength(1);
  });

  test('returns true for free plan under the monthly limit', async () => {
    expect(await checkAiCredits('acme', makeMockPool({ plan: 'free' }, 3))).toBe(true);
  });

  test('returns false for free plan at the monthly limit', async () => {
    expect(await checkAiCredits('acme', makeMockPool({ plan: 'free' }, 5))).toBe(false);
  });

  test('returns false for free plan over the monthly limit', async () => {
    expect(await checkAiCredits('acme', makeMockPool({ plan: 'free' }, 7))).toBe(false);
  });

  test('defaults to free plan when tenant not found', async () => {
    expect(await checkAiCredits('unknown', makeMockPool(null, 4))).toBe(true);
  });

  test('defaults to free plan and blocks when no plan row', async () => {
    expect(await checkAiCredits('unknown', makeMockPool(null, 5))).toBe(false);
  });
});

describe('recordAiUsage', () => {
  test('calls pgPool.query with correct parameters', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    await recordAiUsage({ tenantSlug: 'acme', userId: 'user-1', operation: 'app_draft', tokensUsed: 1500, model: 'gpt-4o-mini', createdAt: new Date('2026-01-15T10:00:00Z') }, pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO platform.ai_usage/i);
    expect(params).toContain('acme');
    expect(params).toContain('user-1');
    expect(params).toContain('app_draft');
    expect(params).toContain(1500);
    expect(params).toContain('gpt-4o-mini');
  });

  test('includes appId when provided', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    await recordAiUsage({ tenantSlug: 'acme', appId: 'app-123', userId: 'user-1', operation: 'script_draft', tokensUsed: 200, model: 'gpt-4o-mini', createdAt: new Date() }, pool);
    expect(pool.query.mock.calls[0][1]).toContain('app-123');
  });

  test('passes null for appId when not provided', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    await recordAiUsage({ tenantSlug: 'acme', userId: 'user-1', operation: 'field_suggestion', tokensUsed: 50, model: 'gpt-4o-mini', createdAt: new Date() }, pool);
    expect(pool.query.mock.calls[0][1]).toContain(null);
  });
});
