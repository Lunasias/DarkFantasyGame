import { describe, expect, it } from "vitest";
import { RoomError, createRoomService } from "@/game/room";

/**
 * Multi-player room lifecycle at the domain layer. The persistence layer (see
 * `src/server/room/room-app-service.ts`) delegates its rule decisions to this
 * same `Room` domain, so these tests verify the authorization, membership, slot,
 * readiness, and state-machine behaviour that the server enforces.
 */
describe("room domain integration (multi-player lifecycle)", () => {
  it("supports join, transfer host, kick, and leave", () => {
    const service = createRoomService();
    const room = service.create({
      name: "R",
      hostId: "h",
      hostName: "H",
      maxPlayers: 3,
    });
    service.join(room.id, "a", "A");
    service.join(room.id, "b", "B");
    expect(room.playerCount).toBe(3);

    service.transferHost(room.id, "h", "a");
    expect(room.host).toBe("a");

    service.kick(room.id, "a", "b");
    expect(room.playerCount).toBe(2);
    expect(room.playerList.map((p) => p.playerId)).not.toContain("b");

    service.leave(room.id, "a");
    expect(room.playerCount).toBe(1);
  });

  it("rejects overfill, duplicate membership, and empty names", () => {
    const service = createRoomService();
    const room = service.create({
      name: "R",
      hostId: "h",
      hostName: "H",
      maxPlayers: 2,
    });
    service.join(room.id, "a", "A");
    expect(() => service.join(room.id, "b", "B")).toThrow(RoomError);
    expect(() => service.join(room.id, "a", "A2")).toThrow(RoomError);
    expect(() => service.join(room.id, "c", "  ")).toThrow(RoomError);
  });

  it("enforces host authorization and readiness before starting", () => {
    const service = createRoomService();
    const room = service.create({
      name: "R",
      hostId: "h",
      hostName: "H",
      maxPlayers: 4,
    });
    service.join(room.id, "a", "A");
    service.join(room.id, "b", "B");

    expect(() => service.start(room.id, "a")).toThrow(RoomError);
    service.setReady(room.id, "h", true);
    service.setReady(room.id, "a", true);
    service.setReady(room.id, "b", true);
    expect(() => service.start(room.id, "a")).toThrow(RoomError);
    service.start(room.id, "h");
    expect(room.statusValue).toBe("starting");
  });

  it("closes a room when the last player leaves", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "H" });
    service.leave(room.id, "h");
    expect(room.statusValue).toBe("closed");
  });

  it("allocates distinct slots and never exceeds max players", () => {
    const service = createRoomService();
    const room = service.create({
      name: "R",
      hostId: "h",
      hostName: "H",
      maxPlayers: 3,
    });
    service.join(room.id, "a", "A");
    service.join(room.id, "b", "B");
    const slots = room.playerList.map((p) => p.slot).sort();
    expect(slots).toEqual([0, 1, 2]);
    expect(room.isFull).toBe(true);
  });
});
