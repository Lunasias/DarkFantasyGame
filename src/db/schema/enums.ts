import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Room lifecycle state machine. Mirrors the domain `RoomStatus`.
 *
 *   waiting → starting → in_game → finished → closed
 */
export const roomStatusEnum = pgEnum("room_status", [
  "waiting",
  "starting",
  "in_game",
  "finished",
  "closed",
]);

/** Game session lifecycle. Mirrors the domain `SessionPhase`. */
export const sessionPhaseEnum = pgEnum("session_phase", [
  "lobby",
  "active",
  "finished",
]);

/** Room discoverability. */
export const roomVisibilityEnum = pgEnum("room_visibility", [
  "public",
  "private",
]);
