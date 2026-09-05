import type { ApiResult } from "../types";

/**
 * Unwrap a server action result into its data, throwing a plain Error carrying
 * the safe message when the action failed.
 */
export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}
