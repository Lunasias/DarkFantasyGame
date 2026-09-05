import { AppError } from "../errors";
import type { RoomView } from "../../types/room";

/**
 * Pure room-authorization helpers on an authoritative {@link RoomView}. They are
 * used by both the application service reads and the SSE stream so the
 * membership/host rules never diverge, and they are unit-testable without a DB.
 */

export function isRoomMember(view: RoomView, userId: string): boolean {
  return view.players.some((player) => player.userId === userId);
}

/** Throw a typed error unless the user is a member of the room (IDOR guard). */
export function requireRoomMember(view: RoomView, userId: string): void {
  if (!isRoomMember(view, userId)) {
    throw new AppError("NOT_IN_ROOM", "You are not a member of this room");
  }
}

export function isRoomHost(view: RoomView, userId: string): boolean {
  return view.hostId === userId;
}
