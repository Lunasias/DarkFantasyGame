import { z } from "zod";
import { isValidRoomCode } from "../../game/room/code";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(64),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  gameMode: z.enum(["standard", "skirmish"]).optional(),
  ruleset: z.enum(["classic", "fast"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export const joinRoomSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .transform((code) => code.toUpperCase())
    .refine(isValidRoomCode, { message: "Invalid room code" }),
});

export const readySchema = z.object({
  roomId: uuid,
  ready: z.boolean(),
});

export const roomIdSchema = z.object({
  roomId: uuid,
});

export const kickSchema = z.object({
  roomId: uuid,
  targetUserId: uuid,
});

export const transferHostSchema = z.object({
  roomId: uuid,
  targetUserId: uuid,
});

export const reconnectSchema = z.object({
  roomId: uuid,
  connected: z.boolean(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type ReadyInput = z.infer<typeof readySchema>;
export type RoomIdInput = z.infer<typeof roomIdSchema>;
export type KickInput = z.infer<typeof kickSchema>;
export type TransferHostInput = z.infer<typeof transferHostSchema>;
export type ReconnectInput = z.infer<typeof reconnectSchema>;
