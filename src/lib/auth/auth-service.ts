import { eq } from "drizzle-orm";
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

/**
 * Server-authoritative authentication. The client never supplies the user id;
 * identity always derives from a validated session token hash stored in the DB.
 *
 * `bcryptjs` for password hashing, random opaque session tokens (only their
 * SHA-256 hash is persisted), and httpOnly cookies. No secrets in code.
 */
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly rateLimiter?: RateLimiter,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
    await this.limit(`register:${input.email}`);
    const email = input.email;

    const existing = await this.findUserByEmail(email);
    if (existing) {
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

    return this.createSession(userId, userAgent);
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    await this.limit(`login:${email}`);
    const user = await this.findUserByEmail(email);
    if (!user?.passwordHash) {
      throw new AppError("UNAUTHENTICATED", "Invalid email or password");
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError("UNAUTHENTICATED", "Invalid email or password");
    }
    return this.createSession(user.id, userAgent);
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

    if (session.expiresAt.getTime() < Date.now()) {
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
