// Simple in-process rate limiter. Adequate for a single long-lived Node server
// (this app's deployment model). For multi-instance/serverless, back this with
// Redis or a database table instead.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}

/**
 * Returns true if the action is allowed, false if the limit is exceeded.
 * Counts an attempt when allowed.
 */
export function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
