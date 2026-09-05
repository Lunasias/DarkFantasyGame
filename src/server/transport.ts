import type { RoomEventView, RoomView } from "../types/room";
import type { RealtimeEvent } from "./realtime/types";

/**
 * The transport seam for realtime multiplayer.
 *
 * The room/session application service never talks to a socket library
 * directly. Instead a concrete transport (Socket.IO, WebSockets, SSE, or a
 * managed pub/sub) is injected behind this interface. Callers broadcast events
 * and snapshots and never depend on a provider, so the realtime layer is never
 * the authoritative source of game state — the database and authoritative
 * server logic remain authoritative.
 */
export interface RealtimeTransport {
  /** Broadcast a room event to everyone subscribed to a room. */
  publishRoomEvent(roomId: string, event: RoomEventView): void | Promise<void>;
  /** Broadcast a full room snapshot (e.g. on subscribe / state change). */
  publishRoomSnapshot(roomId: string, snapshot: RoomView): void | Promise<void>;
  /** Subscribe to a room's realtime events; returns an unsubscribe function. */
  subscribeRoom(
    roomId: string,
    subscriber: (message: RealtimeEvent) => void,
  ): () => void;
}
