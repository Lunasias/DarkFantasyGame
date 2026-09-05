import type { EntityId } from "./types";

/**
 * Generate a stable, collision-resistant entity id.
 *
 * `crypto.randomUUID()` is available in Node 20+, modern browsers, and the
 * edge runtime, so this helper is portable across every environment the
 * engine may run in. It has no framework or runtime dependencies.
 */
export function createId(): EntityId {
  return crypto.randomUUID();
}
