import { getDb } from "../../db";
import { createRateLimiter } from "../../server/rate-limit/rate-limiter";
import { AuthService } from "./auth-service";

let instance: AuthService | null = null;

/** Lazily-built singleton auth service bound to the app database. */
export async function getAuthService(): Promise<AuthService> {
  if (!instance) {
    const db = await getDb();
    instance = new AuthService(db, createRateLimiter());
  }
  return instance;
}

/** Test hook: inject or clear the singleton. */
export function setAuthService(service: AuthService | null): void {
  instance = service;
}
