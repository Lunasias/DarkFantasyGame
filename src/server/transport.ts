import type { GameEvent } from "../game/engine";
import type { RoomSnapshot } from "../game/room";

/**
 * The transport seam for realtime multiplayer (implemented in Phase 1).
 *
 * The room/session domains never talk to a socket library directly. Instead a
 * concrete transport (Socket.IO, WebSockets, SSE, or a managed pub/sub) is
 * injected behind this interface. Callers can later broadcast events and
 * snapshots without changing the domain code.
 */
export interface RealtimeTransport {
  /** Broadcast a domain event to everyone subscribed to a room. */
  publishRoomEvent(roomId: string, event: GameEvent): void | Promise<void>;
  /** Broadcast a full room snapshot (e.g. on join/leave/ready). */
  publishRoomSnapshot(
    roomId: string,
    snapshot: RoomSnapshot,
  ): void | Promise<void>;
  /** Subscribe to a room's messages; returns an unsubscribe function. */
  subscribeRoom(
    roomId: string,
    subscriber: (message: unknown) => void,
  ): () => void;
}
