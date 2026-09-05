import { describe, expect, it } from "vitest";
import {
  isRoomHost,
  isRoomMember,
  requireRoomMember,
} from "@/server/room/authorization";
import type { RoomView } from "@/types/room";

const HOST = "00000000-0000-0000-0000-000000000001";
const MEMBER = "00000000-0000-0000-0000-000000000002";
const OUTSIDER = "00000000-0000-0000-0000-000000000003";

const view: RoomView = {
  id: "room1",
  code: "CODE1",
  name: "Crypt",
  status: "waiting",
  hostId: HOST,
  maxPlayers: 4,
  gameMode: "standard",
  ruleset: "classic",
  visibility: "public",
  players: [
    { userId: HOST, displayName: "H", slot: 0, isHost: true, ready: false, connected: true, joinedAt: "", lastSeenAt: null },
    { userId: MEMBER, displayName: "M", slot: 1, isHost: false, ready: false, connected: true, joinedAt: "", lastSeenAt: null },
  ],
  createdAt: "",
  updatedAt: "",
};

describe("room authorization helpers", () => {
  it("recognizes members and rejects outsiders", () => {
    expect(isRoomMember(view, HOST)).toBe(true);
    expect(isRoomMember(view, MEMBER)).toBe(true);
    expect(isRoomMember(view, OUTSIDER)).toBe(false);
  });

  it("requireRoomMember throws for a non-member and passes for a member", () => {
    expect(() => requireRoomMember(view, OUTSIDER)).toThrow();
    expect(() => requireRoomMember(view, MEMBER)).not.toThrow();
  });

  it("recognizes the host", () => {
    expect(isRoomHost(view, HOST)).toBe(true);
    expect(isRoomHost(view, MEMBER)).toBe(false);
  });
});
