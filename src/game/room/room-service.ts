import type { PlayerId, RoomId } from "../engine/types";
import { roomNotFound } from "./errors";
import { Room } from "./room";
import type { RoomSnapshot, RoomVisibility } from "./types";

export interface CreateRoomInput {
  name: string;
  hostId: PlayerId;
  hostName: string;
  maxPlayers?: number;
  gameMode?: string;
  ruleset?: string;
  visibility?: RoomVisibility;
}

/**
 * The pure-domain room facade (in-memory). It exercises the {@link Room} state
 * machine directly and is used by unit tests, which do not need persistence or
 * realtime. The authoritative, transactional, auth-aware implementation lives in
 * `src/server` and delegates its rule decisions to the same {@link Room} domain.
 */
export interface RoomService {
  create(input: CreateRoomInput): Room;
  get(roomId: RoomId): Room | undefined;
  require(roomId: RoomId): Room;
  snapshot(roomId: RoomId): RoomSnapshot;
  join(roomId: RoomId, playerId: PlayerId, name: string): Room;
  leave(roomId: RoomId, playerId: PlayerId): Room;
  setReady(roomId: RoomId, playerId: PlayerId, ready: boolean): Room;
  setConnected(roomId: RoomId, playerId: PlayerId, connected: boolean): Room;
  kick(roomId: RoomId, actorId: PlayerId, targetId: PlayerId): Room;
  transferHost(roomId: RoomId, actorId: PlayerId, targetId: PlayerId): Room;
  start(roomId: RoomId, actorId: PlayerId): Room;
  beginGame(roomId: RoomId): Room;
}

/** Default in-memory {@link RoomService}. */
export class InMemoryRoomService implements RoomService {
  private readonly rooms = new Map<RoomId, Room>();

  create(input: CreateRoomInput): Room {
    const room = new Room(input);
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

  snapshot(roomId: RoomId): RoomSnapshot {
    return this.require(roomId).toSnapshot();
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

  setConnected(
    roomId: RoomId,
    playerId: PlayerId,
    connected: boolean,
  ): Room {
    const room = this.require(roomId);
    room.setConnected(playerId, connected);
    return room;
  }

  kick(roomId: RoomId, actorId: PlayerId, targetId: PlayerId): Room {
    const room = this.require(roomId);
    room.kick(actorId, targetId);
    return room;
  }

  transferHost(
    roomId: RoomId,
    actorId: PlayerId,
    targetId: PlayerId,
  ): Room {
    const room = this.require(roomId);
    room.transferHost(actorId, targetId);
    return room;
  }

  start(roomId: RoomId, actorId: PlayerId): Room {
    const room = this.require(roomId);
    room.start(actorId);
    return room;
  }

  beginGame(roomId: RoomId): Room {
    const room = this.require(roomId);
    room.beginGame();
    return room;
  }
}

/** Factory for the default implementation. */
export function createRoomService(): RoomService {
  return new InMemoryRoomService();
}
