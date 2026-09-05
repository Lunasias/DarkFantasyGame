import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/cookie";
import { isSessionExpired, isWellFormedToken } from "@/lib/auth/session-policy";

describe("session cookie configuration", () => {
  it("sets httpOnly, sameSite=lax, path=/, and a maxAge", () => {
    const opts = sessionCookieOptions(Date.now() + 60_000);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBeGreaterThan(0);
    expect(SESSION_COOKIE).toBe("dfg_session");
  });

  it("marks the cookie Secure in production", () => {
    const env = process.env as Record<string, string>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    expect(sessionCookieOptions(Date.now() + 1000).secure).toBe(true);
    env.NODE_ENV = prev ?? "test";
  });
});

describe("session lifecyle policy", () => {
  it("treats a session as expired once now is at/past expiresAt", () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    expect(isSessionExpired(new Date("2024-01-01T00:00:01.000Z"), now)).toBe(false);
    expect(isSessionExpired(new Date("2023-12-31T23:59:59.000Z"), now)).toBe(true);
    expect(isSessionExpired(now, now)).toBe(true);
  });

  it("rejects malformed tokens and accepts well-formed ones", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken("has invalid spaces and dots")).toBe(false);
    expect(isWellFormedToken("a".repeat(64))).toBe(true);
  });
});
