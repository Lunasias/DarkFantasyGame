import type { RoomStatus } from "./types";
import { RoomError } from "./errors";

/** The legal transition table. `closed` is terminal. */
export const ROOM_TRANSITIONS: Record<RoomStatus, readonly RoomStatus[]> = {
  waiting: ["starting", "closed"],
  starting: ["in_game", "closed"],
  in_game: ["finished"],
  finished: ["closed"],
  closed: [],
};

export function canTransition(from: RoomStatus, to: RoomStatus): boolean {
  return ROOM_TRANSITIONS[from].includes(to);
}

/**
 * Assert a transition is legal, throwing a typed {@link RoomError} otherwise.
 * Used by both the pure domain and the authoritative server layer so state
 * machines never diverge.
 */
export function assertTransition(from: RoomStatus, to: RoomStatus): void {
  if (!canTransition(from, to)) {
    throw new RoomError(
      "INVALID_ROOM_STATE",
      `Invalid room transition: ${from} → ${to}`,
    );
  }
}
