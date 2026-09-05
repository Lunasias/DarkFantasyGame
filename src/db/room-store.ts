import { and, asc, eq, gt, max } from "drizzle-orm";
import { createId } from "../game/engine/id";
import type { Db } from "./index";
import { roomPlayers } from "./schema/room-players";
import { roomEvents } from "./schema/room-events";
import { rooms } from "./schema/rooms";
import { users } from "./schema/users";
import type { RoomMemberView, RoomEventView, RoomView } from "../types/room";

type Executor = Db;

export async function getRoomView(
  executor: Executor,
  roomId: string,
): Promise<RoomView | null> {
  const [room] = await executor
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) return null;
  return hydrateRoomView(executor, room);
}

export async function getRoomViewByCode(
  executor: Executor,
  code: string,
): Promise<RoomView | null> {
  const [room] = await executor
    .select()
    .from(rooms)
    .where(eq(rooms.roomCode, code))
    .limit(1);
  if (!room) return null;
  return hydrateRoomView(executor, room);
}

async function hydrateRoomView(
  executor: Executor,
  room: {
    id: string;
    roomCode: string;
    name: string;
    status: RoomView["status"];
    hostUserId: string;
    maxPlayers: number;
    gameMode: string;
    ruleset: string;
    visibility: RoomView["visibility"];
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<RoomView> {
  const members = await executor
    .select({
      userId: users.id,
      displayName: users.displayName,
      slot: roomPlayers.slot,
      isHost: roomPlayers.isHost,
      ready: roomPlayers.ready,
      connected: roomPlayers.connected,
      joinedAt: roomPlayers.joinedAt,
      lastSeenAt: roomPlayers.lastSeenAt,
    })
    .from(roomPlayers)
    .innerJoin(users, eq(roomPlayers.userId, users.id))
    .where(eq(roomPlayers.roomId, room.id))
    .orderBy(asc(roomPlayers.slot));

  const players: RoomMemberView[] = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    slot: m.slot,
    isHost: m.isHost,
    ready: m.ready,
    connected: m.connected,
    joinedAt: m.joinedAt.toISOString(),
    lastSeenAt: m.lastSeenAt ? m.lastSeenAt.toISOString() : null,
  }));

  return {
    id: room.id,
    code: room.roomCode,
    name: room.name,
    status: room.status,
    hostId: room.hostUserId,
    maxPlayers: room.maxPlayers,
    gameMode: room.gameMode,
    ruleset: room.ruleset,
    visibility: room.visibility,
    players,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

/**
 * Append a room event inside a transaction. Computes the next monotonic
 * sequence for the room and relies on the unique (room_id, sequence) index to
 * reject duplicate sequences under any residual concurrency.
 */
export async function appendRoomEvent(
  executor: Executor,
  input: {
    roomId: string;
    actorId: string | null;
    type: string;
    payload?: Record<string, unknown>;
  },
): Promise<RoomEventView> {
  const [{ current }] = await executor
    .select({ current: max(roomEvents.sequence) })
    .from(roomEvents)
    .where(eq(roomEvents.roomId, input.roomId));
  const sequence = (current ?? 0) + 1;
  const createdAt = new Date();
  const eventId = createId();

  await executor.insert(roomEvents).values({
    id: eventId,
    roomId: input.roomId,
    actorId: input.actorId,
    type: input.type,
    sequence,
    payload: input.payload ?? {},
    createdAt,
  });

  return {
    id: eventId,
    roomId: input.roomId,
    actorId: input.actorId,
    type: input.type,
    sequence,
    payload: input.payload ?? {},
    createdAt: createdAt.toISOString(),
  };
}

export async function listRoomEventsAfter(
  executor: Executor,
  roomId: string,
  afterSequence: number,
): Promise<RoomEventView[]> {
  const rows = await executor
    .select()
    .from(roomEvents)
    .where(and(eq(roomEvents.roomId, roomId), gt(roomEvents.sequence, afterSequence)))
    .orderBy(asc(roomEvents.sequence));

  return rows.map((row) => ({
      id: row.id,
      roomId: row.roomId,
      actorId: row.actorId,
      type: row.type,
      sequence: row.sequence,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
}
