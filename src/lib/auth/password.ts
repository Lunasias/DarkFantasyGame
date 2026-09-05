import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Hash a plaintext password with bcrypt (pure JS, no native build). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Constant-time-ish verify of a plaintext password against a stored hash. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
