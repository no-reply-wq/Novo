/**
 * Rate limiter — in-process sliding-window counter.
 *
 * Production note: replace the in-memory Map with Upstash Redis or pg for
 * multi-instance deployments. The interface (checkRateLimit) stays identical.
 *
 * Keys are arbitrary strings; callers compose them from IP, email, formId, etc.
 */

interface Window {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, Window>();

// GC: prune expired entries every 5 minutes so the Map doesn't grow unbounded.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store) {
      if (win.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

/**
 * Check (and increment) a rate-limit counter.
 *
 * @param key     Unique string identifying the client+action, e.g. `login:1.2.3.4:user@example.com`
 * @param limit   Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let win = store.get(key);

  if (!win || win.resetAt < now) {
    win = { count: 0, resetAt: now + windowMs };
    store.set(key, win);
  }

  win.count++;
  const allowed = win.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - win.count),
    resetAt: win.resetAt,
  };
}

/** Remove a key from the store (e.g. after a successful login). */
export function clearRateLimit(key: string): void {
  store.delete(key);
}
