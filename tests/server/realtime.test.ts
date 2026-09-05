import { describe, expect, it } from "vitest";
import { InMemoryRealtimeTransport } from "@/server/realtime/in-memory";
import type { RoomEventView } from "@/types/room";

const event = (sequence: number): RoomEventView => ({
  id: `e${sequence}`,
  roomId: "room1",
  actorId: "u1",
  type: "ROOM_PLAYER_JOINED",
  sequence,
  payload: {},
  createdAt: "2024-01-01T00:00:00.000Z",
});

describe("InMemoryRealtimeTransport", () => {
  it("delivers room events and snapshots to subscribers and supports unsubscribe", () => {
    const transport = new InMemoryRealtimeTransport();
    const received: unknown[] = [];
    const unsubscribe = transport.subscribeRoom("room1", (message) =>
      received.push(message),
    );

    transport.publishRoomEvent("room1", event(1));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: "room_event", roomId: "room1" });

    unsubscribe();
    transport.publishRoomEvent("room1", event(2));
    expect(received).toHaveLength(1); // no new messages after unsubscribe
  });

  it("only delivers to subscribers of the matching room", () => {
    const transport = new InMemoryRealtimeTransport();
    const other: unknown[] = [];
    transport.subscribeRoom("other", (message) => other.push(message));

    transport.publishRoomEvent("room1", event(1));
    expect(other).toHaveLength(0);
  });

  it("reports its subscriber count", () => {
    const transport = new InMemoryRealtimeTransport();
    const unsub1 = transport.subscribeRoom("room1", () => undefined);
    transport.subscribeRoom("room1", () => undefined);
    expect(transport.subscriberCount("room1")).toBe(2);
    unsub1();
    expect(transport.subscriberCount("room1")).toBe(1);
  });
});
