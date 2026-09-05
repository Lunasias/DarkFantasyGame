export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Rate-limiter abstraction. Phase 1 ships an in-memory implementation that
 * works in a single process (dev/tests); a production deployment can swap in a
 * distributed implementation (Vercel KV / Redis / Upstash) behind this same
 * interface without changing call sites.
 */
export interface RateLimiter {
  consume(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
}

const FALLBACK_RESET = Number.POSITIVE_INFINITY;

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + options.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: options.limit - 1, resetAt };
    }

    if (bucket.count + 1 > options.limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: options.limit - bucket.count,
      resetAt: bucket.resetAt,
    };
  }

  /** Test hook: clear all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}

export function createRateLimiter(): RateLimiter {
  return new InMemoryRateLimiter();
}

export { FALLBACK_RESET };
