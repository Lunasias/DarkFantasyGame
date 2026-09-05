/**
 * Pure session lifecycle policy functions, kept framework- and DB-independent so
 * they can be unit-tested in isolation.
 */

/** A session is expired once `now` has passed its `expiresAt` (inclusive). */
export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * A token is valid only if it is well-formed (has a hashable length) and not
 * empty. The authoritative validity check is the session lookup + expiry.
 */
export function isWellFormedToken(token: string): boolean {
  return token.length >= 32 && /^[A-Za-z0-9_-]+$/.test(token);
}
