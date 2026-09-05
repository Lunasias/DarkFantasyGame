import { createRateLimiter } from "./rate-limiter";
import type { RateLimiter } from "./rate-limiter";

let instance: RateLimiter | null = null;

/**
 * Shared process-local rate limiter for request handlers (e.g. the SSE stream)
 * that are not layered behind the auth service's own limiter. It is an
 * in-memory, single-process implementation — production must substitute a
 * distributed limiter (Redis / Upstash / Vercel KV) behind the same interface.
 */
export function getRateLimiter(): RateLimiter {
  if (!instance) {
    instance = createRateLimiter();
  }
  return instance;
}
