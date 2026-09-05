import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { gameSessions } from "../../db/schema/game-sessions";
import { roomPlayers } from "../../db/schema/room-players";
import { rooms } from "../../db/schema/rooms";
import { loadGameState } from "../../db/game-store";
import { AppError } from "../errors";

/**
 * Authoritative resume snapshot for a session. Server-side only: authenticates
 * the actor against room membership, then reconstructs durable game state from
 * the DB. The client never supplies authoritative values.
 */
export async function getGameSnapshot(db: Db, actorId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .limit(1);
  if (!session) throw new AppError("ROOM_NOT_FOUND", "Game session not found");

  if (!session.roomId) {
    throw new AppError("ROOM_NOT_FOUND", "Session is not attached to a room");
  }

  const [member] = await db
    .select({ id: roomPlayers.id })
    .from(roomPlayers)
    .where(and(eq(roomPlayers.roomId, session.roomId), eq(roomPlayers.userId, actorId)))
    .limit(1);
  if (!member) {
    throw new AppError("UNAUTHORIZED", "You are not a member of this session");
  }

  const [room] = await db.select({ roomCode: rooms.roomCode }).from(rooms)
    .where(eq(rooms.id, session.roomId)).limit(1);

  const state = await loadGameState(db, sessionId);
  return {
    sessionId,
    roomCode: room?.roomCode ?? null,
    phase: state.phase,
    currentTurnNumber: state.currentTurnNumber,
    stateVersion: state.stateVersion,
    positions: state.positions,
    combat: state.combat,
  };
}
