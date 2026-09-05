/** Detect a Postgres unique-violation error (works for `pg`, pg-mem, and
 * Drizzle wrappers whose `driverError`/`cause` carries the real code). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as {
    code?: string;
    message?: string;
    driverError?: { code?: string };
    cause?: { code?: string };
  };
  const code = err.code ?? err.driverError?.code ?? err.cause?.code;
  if (code === "23505") return true;
  return /duplicate|unique violation/i.test(err.message ?? "");
}
