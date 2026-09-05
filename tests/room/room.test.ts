import { describe, expect, it } from "vitest";
import { RoomError, createRoomService } from "@/game/room";

describe("RoomService (domain, in-memory)", () => {
  it("creates a room with the host seated and waiting", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    expect(room.statusValue).toBe("waiting");
    expect(room.host).toBe("p1");
    expect(room.playerCount).toBe(1);
    expect(room.code).toHaveLength(6);
  });

  it("joins players up to the configured maximum", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
      maxPlayers: 2,
    });
    service.join(room.id, "p2", "Vex");
    expect(room.playerCount).toBe(2);
    expect(room.isFull).toBe(true);
    expect(() => service.join(room.id, "p3", "Thane")).toThrow(RoomError);
  });

  it("rejects joining a room that does not exist", () => {
    const service = createRoomService();
    expect(() => service.join("missing", "p2", "Vex")).toThrow(RoomError);
  });

  it("rejects a duplicate player", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    expect(() => service.join(room.id, "p1", "Clone")).toThrow(RoomError);
  });

  it("leaves a room and reassigns the host", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    service.join(room.id, "p2", "Vex");
    service.leave(room.id, "p1");
    expect(room.host).toBe("p2");
    expect(room.playerCount).toBe(1);
  });

  it("tracks readiness and requires everyone ready to start", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    service.join(room.id, "p2", "Vex");
    service.setReady(room.id, "p1", true);
    service.setReady(room.id, "p2", true);
    expect(room.canStart).toBe(true);

    service.setReady(room.id, "p2", false);
    expect(room.canStart).toBe(false);
  });

  it("throws when starting a room that is not ready", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    service.join(room.id, "p2", "Vex");
    expect(() => service.start(room.id, "p1")).toThrow(RoomError);
  });

  it("starts a room once all players are ready", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    service.join(room.id, "p2", "Vex");
    service.setReady(room.id, "p1", true);
    service.setReady(room.id, "p2", true);
    service.start(room.id, "p1");
    expect(room.statusValue).toBe("starting");
  });

  it("prevents joining a room that has left the waiting state", () => {
    const service = createRoomService();
    const room = service.create({
      name: "Crypt",
      hostId: "p1",
      hostName: "Morgath",
    });
    service.join(room.id, "p2", "Vex");
    service.setReady(room.id, "p1", true);
    service.setReady(room.id, "p2", true);
    service.start(room.id, "p1");
    expect(() => service.join(room.id, "p3", "Thane")).toThrow(RoomError);
  });
});
