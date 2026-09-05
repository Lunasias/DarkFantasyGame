/**
 * Shared application types. This barrel aggregates the domain types consumed by
 * both server and client code, plus a small set of transport-facing API shapes.
 */
export * from "../game";

/** Standard error payload returned by API routes. */
export interface ApiError {
  code: string;
  message: string;
}

/** Discriminated union wrapper for API responses. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
