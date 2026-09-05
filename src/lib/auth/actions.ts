"use server";

import { cookies, headers } from "next/headers";
import type { ApiResult } from "../../types";
import { getAuthService } from "./service";
import { getCurrentUser } from "./session";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookie";
import { loginSchema, registerSchema } from "./schemas";
import type { AuthUser } from "./auth-service";
import { assertValid, runAction } from "../result";

export async function registerAction(
  input: unknown,
): Promise<ApiResult<AuthUser>> {
  return runAction(async () => {
    const parsed = assertValid(registerSchema, input);
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    const auth = await getAuthService();
    const result = await auth.register(parsed, userAgent);
    const store = await cookies();
    store.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt.getTime()));
    return result.user;
  });
}

export async function loginAction(input: unknown): Promise<ApiResult<AuthUser>> {
  return runAction(async () => {
    const parsed = assertValid(loginSchema, input);
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    const auth = await getAuthService();
    const result = await auth.login(parsed.email, parsed.password, userAgent);
    const store = await cookies();
    store.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt.getTime()));
    return result.user;
  });
}

export async function logoutAction(): Promise<ApiResult<{ ok: true }>> {
  return runAction(async () => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const auth = await getAuthService();
    await auth.logout(token);
    if (token) store.delete(SESSION_COOKIE);
    return { ok: true };
  });
}

export async function getMeAction(): Promise<ApiResult<AuthUser | null>> {
  return runAction(async () => getCurrentUser());
}
