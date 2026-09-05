import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "@/server/rate-limit/rate-limiter";

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit and rejects thereafter within the window", async () => {
    const limiter = new InMemoryRateLimiter();
    const opts = { limit: 3, windowMs: 60_000 };

    expect((await limiter.consume("k", opts)).allowed).toBe(true);
    expect((await limiter.consume("k", opts)).allowed).toBe(true);
    expect((await limiter.consume("k", opts)).allowed).toBe(true);
    expect((await limiter.consume("k", opts)).allowed).toBe(false);
  });

  it("tracks buckets independently per key", async () => {
    const limiter = new InMemoryRateLimiter();
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await limiter.consume("a", opts)).allowed).toBe(true);
    expect((await limiter.consume("b", opts)).allowed).toBe(true);
    expect((await limiter.consume("a", opts)).allowed).toBe(false);
    expect((await limiter.consume("b", opts)).allowed).toBe(false);
  });

  it("resets all buckets", async () => {
    const limiter = new InMemoryRateLimiter();
    const opts = { limit: 1, windowMs: 60_000 };
    await limiter.consume("k", opts);
    expect((await limiter.consume("k", opts)).allowed).toBe(false);
    limiter.reset();
    expect((await limiter.consume("k", opts)).allowed).toBe(true);
  });

  it("reports remaining count", async () => {
    const limiter = new InMemoryRateLimiter();
    const r = await limiter.consume("k", { limit: 5, windowMs: 60_000 });
    expect(r.remaining).toBe(4);
    expect(r.allowed).toBe(true);
  });
});
