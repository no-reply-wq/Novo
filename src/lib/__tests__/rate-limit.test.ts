/**
 * Tests for src/lib/rate-limit.ts
 *
 * Covers:
 * - 6th login attempt is blocked (5-attempt window)
 * - Different keys are independent
 * - Window resets after expiry
 * - clearRateLimit allows immediate retry
 * - remaining count is correct
 */

import { checkRateLimit, clearRateLimit } from '../rate-limit';

describe('checkRateLimit', () => {
  const KEY = 'test:rate-limit:unique-key-' + Math.random();

  afterEach(() => {
    clearRateLimit(KEY);
  });

  it('allows first 5 attempts (limit=5)', () => {
    for (let i = 1; i <= 5; i++) {
      const result = checkRateLimit(KEY, 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i);
    }
  });

  it('blocks the 6th attempt', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(KEY, 5, 60_000);
    const result = checkRateLimit(KEY, 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('blocks all subsequent attempts after limit', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(KEY, 5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(KEY, 5, 60_000).allowed).toBe(false);
    }
  });

  it('different keys are independent', () => {
    const keyA = KEY + ':A';
    const keyB = KEY + ':B';
    for (let i = 0; i < 5; i++) checkRateLimit(keyA, 5, 60_000);
    // keyB should still be allowed
    expect(checkRateLimit(keyB, 5, 60_000).allowed).toBe(true);
    clearRateLimit(keyA);
    clearRateLimit(keyB);
  });

  it('clearRateLimit allows immediate retry', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(KEY, 5, 60_000);
    expect(checkRateLimit(KEY, 5, 60_000).allowed).toBe(false);
    clearRateLimit(KEY);
    expect(checkRateLimit(KEY, 5, 60_000).allowed).toBe(true);
  });

  it('window resets after expiry', async () => {
    const shortKey = KEY + ':short';
    for (let i = 0; i < 5; i++) checkRateLimit(shortKey, 5, 50); // 50ms window
    expect(checkRateLimit(shortKey, 5, 50).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60)); // wait for window to expire
    expect(checkRateLimit(shortKey, 5, 50).allowed).toBe(true);
    clearRateLimit(shortKey);
  });

  it('resetAt is in the future', () => {
    const result = checkRateLimit(KEY, 5, 60_000);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
