import type { RoomEventView, RoomView } from "../../types/room";

/** The realtime event types emitted for room updates. */
export const ROOM_EVENT_TYPES = [
  "ROOM_PLAYER_JOINED",
  "ROOM_PLAYER_LEFT",
  "ROOM_PLAYER_READY_CHANGED",
  "ROOM_PLAYER_CONNECTED",
  "ROOM_PLAYER_DISCONNECTED",
  "ROOM_HOST_CHANGED",
  "ROOM_STATE_CHANGED",
  "GAME_STARTED",
] as const;

export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

/** A message pushed to a realtime subscriber. */
export type RealtimeEvent =
  | { readonly kind: "room_event"; readonly roomId: string; readonly event: RoomEventView }
  | { readonly kind: "room_snapshot"; readonly roomId: string; readonly snapshot: RoomView };

/** Payload convenience record for the events we emit. */
export interface EventPayload {
  readonly [key: string]: unknown;
}
