import { cookies } from "next/headers";
import { AppError } from "../../server/errors";
import type { AuthUser } from "./auth-service";
import { SESSION_COOKIE } from "./cookie";
import { getAuthService } from "./service";

/**
 * Derive the authenticated user from the httpOnly session cookie. Identity is
 * always server-authoritative: the client never supplies a user id.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const auth = await getAuthService();
  return auth.validate(token);
}

/** Like {@link getCurrentUser} but throws when unauthenticated. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "You must be signed in");
  }
  return user;
}
