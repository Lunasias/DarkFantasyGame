/**
 * Short, human-friendly join code.
 *
 * Uses an alphabet that omits visually ambiguous characters (0/O, 1/I/L) so
 * codes are easy to read and type. Codes are random; uniqueness is guaranteed by
 * a database unique constraint plus retry-on-collision in the persistence layer.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Validate a client-supplied join code shape before using it in a query. */
export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,10}$/.test(code);
}
