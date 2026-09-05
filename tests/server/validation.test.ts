import { describe, expect, it } from "vitest";
import {
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  readySchema,
  roomIdSchema,
  transferHostSchema,
} from "@/server/room/schemas";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";

describe("createRoomSchema validation", () => {
  it("accepts a valid creation request and strips unexpected fields", () => {
    const parsed = createRoomSchema.safeParse({
      name: "The Crypt",
      maxPlayers: 4,
      visibility: "private",
      hacker: "drop tables",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("hacker");
      expect(parsed.data.name).toBe("The Crypt");
    }
  });

  it("rejects invalid maxPlayers, visibility, game mode, ruleset, and oversized name", () => {
    expect(createRoomSchema.safeParse({ name: "R", maxPlayers: 1 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", maxPlayers: 9 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", visibility: "invite" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", gameMode: "battle-royale" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", ruleset: "house" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "x".repeat(65) }).success).toBe(false);
  });
});

describe("joinRoomSchema validation", () => {
  it("accepts a valid room code and uppercases it", () => {
    const parsed = joinRoomSchema.safeParse({ roomCode: "abc123" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.roomCode).toBe("ABC123");
  });

  it("rejects malformed and overspaced room codes", () => {
    expect(joinRoomSchema.safeParse({ roomCode: "ab" }).success).toBe(false);
    expect(joinRoomSchema.safeParse({ roomCode: "a".repeat(11) }).success).toBe(false);
    expect(joinRoomSchema.safeParse({ roomCode: "!!invalid!!" }).success).toBe(false);
  });
});

describe("id + action validation", () => {
  const validUuid = "00000000-0000-0000-0000-000000000001";
  it("rejects invalid ids and accepts valid uuid ids", () => {
    expect(roomIdSchema.safeParse({ roomId: "not-a-uuid" }).success).toBe(false);
    expect(roomIdSchema.safeParse({ roomId: validUuid }).success).toBe(true);
    expect(kickSchema.safeParse({ roomId: validUuid, targetUserId: "nope" }).success).toBe(false);
    expect(transferHostSchema.safeParse({ roomId: validUuid, targetUserId: validUuid }).success).toBe(true);
  });

  it("requires a boolean ready", () => {
    expect(readySchema.safeParse({ roomId: validUuid, ready: "yes" }).success).toBe(false);
    expect(readySchema.safeParse({ roomId: validUuid, ready: true }).success).toBe(true);
  });
});

describe("auth schema validation", () => {
  it("enforces password length and field types", () => {
    expect(loginSchema.safeParse({ email: "x@y.com", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "x@y.com", password: "password123" }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "x", password: "password123", displayName: "N" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "x@y.com", password: "password123", displayName: "" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "x@y.com", password: "password123", displayName: "N" }).success).toBe(true);
  });

  it("strips unexpected fields from register input", () => {
    const parsed = registerSchema.safeParse({
      email: "x@y.com",
      password: "password123",
      displayName: "N",
      role: "admin",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("role");
  });
});
