import { createId } from "../engine/id";
import type { PlayerId, RoomId } from "../engine/types";
import { roomNotFound } from "./errors";
import { Room } from "./room";
import type { RoomSnapshot } from "./types";

export interface CreateRoomInput {
  name: string;
  hostId: PlayerId;
  hostName: string;
  maxPlayers?: number;
}

/**
 * The contract for room operations. Phase 0 ships an in-memory implementation
 * so the domain and tests run anywhere; Phase 1 will provide a
 * database-backed + realtime broadcast implementation of the SAME interface
 * without the domain or callers changing.
 */
export interface RoomService {
  create(input: CreateRoomInput): Room;
  get(roomId: RoomId): Room | undefined;
  require(roomId: RoomId): Room;
  join(roomId: RoomId, playerId: PlayerId, name: string): Room;
  leave(roomId: RoomId, playerId: PlayerId): Room;
  setReady(roomId: RoomId, playerId: PlayerId, ready: boolean): Room;
  setHost(roomId: RoomId, playerId: PlayerId): Room;
  start(roomId: RoomId): Room;
  snapshot(roomId: RoomId): RoomSnapshot;
}

/** Default in-memory {@link RoomService}. */
export class InMemoryRoomService implements RoomService {
  private readonly rooms = new Map<RoomId, Room>();

  create(input: CreateRoomInput): Room {
    const room = new Room({ ...input, id: createId() });
    this.rooms.set(room.id, room);
    return room;
  }

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  require(roomId: RoomId): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw roomNotFound(roomId);
    }
    return room;
  }

  join(roomId: RoomId, playerId: PlayerId, name: string): Room {
    const room = this.require(roomId);
    room.addPlayer(playerId, name);
    return room;
  }

  leave(roomId: RoomId, playerId: PlayerId): Room {
    const room = this.require(roomId);
    room.removePlayer(playerId);
    return room;
  }

  setReady(roomId: RoomId, playerId: PlayerId, ready: boolean): Room {
    const room = this.require(roomId);
    room.setReady(playerId, ready);
    return room;
  }

  setHost(roomId: RoomId, playerId: PlayerId): Room {
    const room = this.require(roomId);
    room.setHost(playerId);
    return room;
  }

  start(roomId: RoomId): Room {
    const room = this.require(roomId);
    room.start();
    return room;
  }

  snapshot(roomId: RoomId): RoomSnapshot {
    return this.require(roomId).toSnapshot();
  }
}

/** Factory for the default implementation. */
export function createRoomService(): RoomService {
  return new InMemoryRoomService();
}
