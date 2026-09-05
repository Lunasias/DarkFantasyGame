/** Detect a Postgres unique-violation error (works for `pg` and pg-mem). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const message = (error as { message?: string }).message ?? "";
  return /duplicate|unique violation/i.test(message);
}
