import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

/** Generate a cryptographically-random session token (base64url). */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * One-way hash of a session token. Only the hash is persisted, so a database
 * leak cannot be replayed as a live session cookie.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
