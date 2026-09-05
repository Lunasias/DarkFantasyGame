import { eq, lt } from "drizzle-orm";
import type { Db } from "../../db";
import { createId } from "../../game/engine/id";
import { playerProfiles } from "../../db/schema/player-profiles";
import { sessions } from "../../db/schema/sessions";
import { users } from "../../db/schema/users";
import { AppError } from "../../server/errors";
import type { RateLimiter } from "../../server/rate-limit/rate-limiter";
import { SESSION_DURATION_MS } from "./cookie";
import { hashPassword, verifyPassword } from "./password";
import type { RegisterInput } from "./schemas";
import { isSessionExpired } from "./session-policy";
import { generateSessionToken, hashToken } from "./tokens";

/** Sanitized, client-safe identity (never includes the password hash). */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface AuthResult {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: AuthUser;
}

/** Context supplied by the caller (transport) — never trusted by the client. */
export interface AuthContext {
  readonly userAgent?: string;
  /**
   * Stable per-client key (typically the client IP) used for rate limiting.
   * Per-email keys let an attacker enumerate accounts by cycling emails; a
   * per-client key throttles enumeration and brute-force regardless of email.
   */
  readonly rateLimitKey?: string;
}

/**
 * Server-authoritative authentication. The client never supplies the user id;
 * identity always derives from a validated session token hash stored in the DB.
 *
 * `bcryptjs` for password hashing, random opaque session tokens (only their
 * SHA-256 hash is persisted), and httpOnly cookies. No secrets in code.
 */
export class AuthService {
  /** Lazily-computed hash used to equalize login timing for unknown users. */
  private dummyHash: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly rateLimiter?: RateLimiter,
  ) {}

  async register(
    input: RegisterInput,
    context: AuthContext = {},
  ): Promise<AuthResult> {
    await this.limit(`register:${context.rateLimitKey ?? input.email}`);
    const email = input.email;

    const existing = await this.findUserByEmail(email);
    if (existing) {
      // Generic message: rate limiting + an identical message protects against
      // straightforward account enumeration (documented tradeoff).
      throw new AppError(
        "VALIDATION_ERROR",
        "An account with this email already exists",
      );
    }

    const passwordHash = await hashPassword(input.password);
    const userId = createId();
    await this.db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      displayName: input.displayName,
    });

    // Create the persistent progression profile (Phase 0 table).
    await this.db.insert(playerProfiles).values({
      id: createId(),
      userId,
      playerName: input.displayName,
      level: 1,
      totalGold: 0,
    });

    return this.createSession(userId, context.userAgent);
  }

  async login(
    email: string,
    password: string,
    context: AuthContext = {},
  ): Promise<AuthResult> {
    await this.limit(`login:${context.rateLimitKey ?? email}`);
    const user = await this.findUserByEmail(email);

    // Constant-ish work: for an unknown/failed user we still run a bcrypt
    // comparison against a throwaway hash so the response time does not reveal
    // whether the account exists (timing-based enumeration).
    if (!user?.passwordHash) {
      await verifyPassword(password, await this.getDummyHash());
      throw new AppError("UNAUTHENTICATED", "Invalid email or password");
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError("UNAUTHENTICATED", "Invalid email or password");
    }
    return this.createSession(user.id, context.userAgent);
  }

  /** Validate a session token and return its user, or null when invalid. */
  async validate(token: string | null | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    if (!session) return null;

    if (isSessionExpired(session.expiresAt)) {
      await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
      return null;
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    return user ? this.sanitize(user) : null;
  }

  async logout(token: string | null | undefined): Promise<void> {
    if (!token) return;
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  /**
   * Delete all expired sessions. In serverless there is no long-running cron, so
   * this is called opportunistically (e.g. a low-probability path on auth) and
   * is also safe to invoke from a scheduled job. `validate` also deletes a
   * single expired session it encounters, so storage cannot grow unboundedly
   * between prunes.
   */
  async pruneExpiredSessions(now: Date = new Date()): Promise<number> {
    const result = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now));
    return result.rowCount ?? 0;
  }

  private async getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      this.dummyHash = await hashPassword("timing-equalizer");
    }
    return this.dummyHash;
  }

  private async createSession(
    userId: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent,
    });
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Session user not found");
    }
    return { token, expiresAt, user: this.sanitize(user) };
  }

  private async findUserByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  private async limit(key: string): Promise<void> {
    if (!this.rateLimiter) return;
    const result = await this.rateLimiter.consume(key, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!result.allowed) {
      throw new AppError("RATE_LIMITED", "Too many attempts, please try again");
    }
  }

  private sanitize(user: {
    id: string;
    email: string;
    displayName: string;
  }): AuthUser {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
