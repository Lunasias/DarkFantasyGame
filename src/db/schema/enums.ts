import { pgEnum } from "drizzle-orm/pg-core";

/** Room lifecycle. Mirrors the domain `RoomStatus`. */
export const roomStatusEnum = pgEnum("room_status", [
  "waiting",
  "ready",
  "in_progress",
  "closed",
]);

/** Game session lifecycle. Mirrors the domain `SessionPhase`. */
export const sessionPhaseEnum = pgEnum("session_phase", [
  "lobby",
  "active",
  "finished",
]);
