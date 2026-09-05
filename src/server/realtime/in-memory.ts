import type { RoomEventView, RoomView } from "../../types/room";
import type { RealtimeTransport } from "../transport";
import type { RealtimeEvent } from "./types";

/**
 * In-process realtime transport. It holds subscribe/publish state in memory and
 * is intended for a single Next.js dev server instance and for tests.
 *
 * Production should substitute a distributed transport (managed WS/pub-sub or a
 * Vercel-compatible provider) behind the same {@link RealtimeTransport}
 * interface; the application service and the SSE client do not change.
 */
export class InMemoryRealtimeTransport implements RealtimeTransport {
  private readonly subscribers = new Map<
    string,
    Set<(message: RealtimeEvent) => void>
  >();

  publishRoomEvent(roomId: string, event: RoomEventView): void {
    this.broadcast(roomId, {
      kind: "room_event",
      roomId,
      event,
    });
  }

  publishRoomSnapshot(roomId: string, snapshot: RoomView): void {
    this.broadcast(roomId, {
      kind: "room_snapshot",
      roomId,
      snapshot,
    });
  }

  subscribeRoom(
    roomId: string,
    subscriber: (message: RealtimeEvent) => void,
  ): () => void {
    const set =
      this.subscribers.get(roomId) ?? new Set<(message: RealtimeEvent) => void>();
    set.add(subscriber);
    this.subscribers.set(roomId, set);
    return () => {
      set.delete(subscriber);
    };
  }

  private broadcast(roomId: string, message: RealtimeEvent): void {
    const set = this.subscribers.get(roomId);
    if (!set) return;
    for (const callback of [...set]) {
      callback(message);
    }
  }

  /** Test helper: number of active subscribers for a room. */
  subscriberCount(roomId: string): number {
    return this.subscribers.get(roomId)?.size ?? 0;
  }
}

export function createRealtimeTransport(): RealtimeTransport {
  return new InMemoryRealtimeTransport();
}
