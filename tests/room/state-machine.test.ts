import { describe, expect, it } from "vitest";
import {
  Room,
  RoomError,
  assertTransition,
  canTransition,
  createRoomService,
} from "@/game/room";

describe("room state machine", () => {
  it("allows only legal transitions", () => {
    expect(canTransition("waiting", "starting")).toBe(true);
    expect(canTransition("waiting", "closed")).toBe(true);
    expect(canTransition("starting", "in_game")).toBe(true);
    expect(canTransition("in_game", "finished")).toBe(true);
    expect(canTransition("finished", "closed")).toBe(true);

    expect(canTransition("waiting", "in_game")).toBe(false);
    expect(canTransition("starting", "finished")).toBe(false);
    expect(canTransition("in_game", "starting")).toBe(false);
    expect(canTransition("closed", "waiting")).toBe(false);

    expect(() => assertTransition("in_game", "starting")).toThrow(RoomError);
    expect(() => assertTransition("waiting", "in_game")).toThrow(RoomError);
  });
});

describe("Room domain", () => {
  it("allocates server slots without gaps and never exceeds max players", () => {
    const service = createRoomService();
    const room = service.create({
      name: "R",
      hostId: "h",
      hostName: "Host",
      maxPlayers: 3,
    });
    service.join(room.id, "a", "A");
    service.join(room.id, "b", "B");
    expect(room.playerList.map((p) => p.slot).sort()).toEqual([0, 1, 2]);
    expect(room.isFull).toBe(true);
    expect(() => service.join(room.id, "c", "C")).toThrow(RoomError);
  });

  it("rejects duplicate membership", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "Host" });
    expect(() => service.join(room.id, "h", "Clone")).toThrow(RoomError);
  });

  it("enforces host permissions for kick, transfer, and start", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "Host" });
    service.join(room.id, "a", "A");
    service.join(room.id, "b", "B");

    expect(() => service.kick(room.id, "a", "b")).toThrow(RoomError);
    expect(() => service.transferHost(room.id, "a", "b")).toThrow(RoomError);

    service.setReady(room.id, "h", true);
    service.setReady(room.id, "a", true);
    service.setReady(room.id, "b", true);
    expect(() => service.start(room.id, "a")).toThrow(RoomError);
  });

  it("allows the host to transfer host then kick", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "Host" });
    service.join(room.id, "a", "A");
    service.transferHost(room.id, "h", "a");
    expect(room.host).toBe("a");
    service.kick(room.id, "a", "h");
    expect(room.playerCount).toBe(1);
    expect(room.host).toBe("a");
  });

  it("requires all players ready before starting", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "Host" });
    service.join(room.id, "a", "A");
    expect(() => service.start(room.id, "h")).toThrow(RoomError);
    service.setReady(room.id, "h", true);
    service.setReady(room.id, "a", true);
    service.start(room.id, "h");
    expect(room.statusValue).toBe("starting");
  });

  it("tracks connection state (reconnect foundation)", () => {
    const service = createRoomService();
    const room = service.create({ name: "R", hostId: "h", hostName: "Host" });
    service.setConnected(room.id, "h", false);
    const host = room.playerList.find((p) => p.playerId === "h");
    expect(host?.connected).toBe(false);
  });

  it("is joinable only while waiting and not full", () => {
    const room = new Room({
      name: "R",
      hostId: "h",
      hostName: "Host",
      maxPlayers: 2,
    });
    expect(room.isJoinable).toBe(true);
    room.addPlayer("a", "A");
    expect(room.isJoinable).toBe(false);
  });
});
