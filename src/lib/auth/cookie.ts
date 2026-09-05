export const SESSION_COOKIE = "dfg_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Cookie attributes for the session cookie (httpOnly, sameSite=lax). */
export function sessionCookieOptions(expiresAtMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAtMs),
    maxAge: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
