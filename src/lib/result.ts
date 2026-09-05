import type { ApiResult, ApiError } from "../types";
import { AppError, toAppError } from "../server/errors";

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ApiResult<never> {
  const resolved: AppError =
    error instanceof AppError ? error : toAppError(error);
  const apiError: ApiError = {
    code: resolved.code,
    message: resolved.message,
    fieldErrors: resolved.fieldErrors,
  };
  return { ok: false, error: apiError };
}

/** Run a server action body, converting any thrown error into a safe result. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return fail(error);
  }
}

/** Run a Zod validation, throwing a validation-flavoured AppError on failure. */
export function assertValid<T>(schema: { parse: (v: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    const fieldErrors: Record<string, string[]> = {};
    const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })
      .issues;
    for (const issue of issues ?? []) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new AppError("VALIDATION_ERROR", "Invalid input", fieldErrors);
  }
}
