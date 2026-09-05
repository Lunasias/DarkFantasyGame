import { createId } from "../engine/id";
import type { PlayerId, RoomId } from "../engine/types";
import { RoomError } from "./errors";
import {
  DEFAULT_MAX_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type RoomOptions,
  type RoomPlayer,
  type RoomSnapshot,
  type RoomStatus,
} from "./types";

/**
 * A `Room` is the pre-game lobby where players gather, declare readiness, and
 * assign a host before a {@link GameSession} is created.
 *
 * Rooms are pure domain objects: they hold state and enforce transitions but
 * know nothing about networking. A realtime transport (or a database-backed
 * service) plugs in via the {@link RoomService} seam. Room size, readiness, and
 * host rules are all configured here.
 */
export class Room {
  readonly id: RoomId;
  readonly name: string;
  readonly maxPlayers: number;
  readonly createdAt: number;
  private status: RoomStatus;
  private hostId: PlayerId;
  private updatedAt: number;
  private readonly players = new Map<PlayerId, RoomPlayer>();

  constructor(options: RoomOptions) {
    this.id = options.id ?? createId();
    const name = options.name.trim();
    if (name.length === 0) {
      throw new RoomError("INVALID_STATE", "Room name must not be empty");
    }
    const maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
      throw new RoomError(
        "INVALID_STATE",
        `maxPlayers must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`,
      );
    }
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.status = "waiting";
    this.hostId = options.hostId;
    this.players.set(options.hostId, {
      playerId: options.hostId,
      name: options.hostName,
      isHost: true,
      ready: false,
      joinedAt: this.createdAt,
    });
  }

  get statusValue(): RoomStatus {
    return this.status;
  }

  get host(): PlayerId {
    return this.hostId;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get playerList(): readonly RoomPlayer[] {
    return [...this.players.values()];
  }

  get allReady(): boolean {
    return (
      this.players.size > 0 &&
      [...this.players.values()].every((player) => player.ready)
    );
  }

  get canStart(): boolean {
    return (
      this.status === "ready" &&
      this.players.size >= MIN_PLAYERS &&
      this.allReady
    );
  }

  addPlayer(playerId: PlayerId, name: string): RoomPlayer {
    if (this.status === "in_progress") {
      throw new RoomError("ROOM_IN_PROGRESS", "Cannot join a room already in progress");
    }
    if (this.status === "closed") {
      throw new RoomError("ROOM_CLOSED", "Cannot join a closed room");
    }
    if (this.players.has(playerId)) {
      throw new RoomError("PLAYER_ALREADY_JOINED", "Player is already in this room");
    }
    if (this.isFull) {
      throw new RoomError("ROOM_FULL", `Room is full (${this.maxPlayers})`);
    }

    const member: RoomPlayer = {
      playerId,
      name,
      isHost: false,
      ready: false,
      joinedAt: Date.now(),
    };
    this.players.set(playerId, member);
    this.touch();
    return member;
  }

  removePlayer(playerId: PlayerId): void {
    if (!this.players.has(playerId)) {
      throw new RoomError("PLAYER_NOT_IN_ROOM", "Player is not in this room");
    }
    if (this.status === "in_progress") {
      throw new RoomError("ROOM_IN_PROGRESS", "Cannot leave a room already in progress");
    }

    this.players.delete(playerId);
    this.touch();

    if (this.players.size === 0) {
      this.status = "closed";
      return;
    }

    if (this.hostId === playerId) {
      const nextHostId = this.players.keys().next().value as PlayerId;
      const nextHost = this.players.get(nextHostId);
      if (nextHost) {
        nextHost.isHost = true;
      }
      this.hostId = nextHostId;
    }
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    const member = this.players.get(playerId);
    if (!member) {
      throw new RoomError("PLAYER_NOT_IN_ROOM", "Player is not in this room");
    }
    if (this.status === "in_progress" || this.status === "closed") {
      throw new RoomError(
        "INVALID_STATE",
        "Readiness can only change before the game starts",
      );
    }

    member.ready = ready;
    this.touch();
    this.recomputeReadiness();
  }

  setHost(playerId: PlayerId): void {
    if (this.status !== "waiting") {
      throw new RoomError("INVALID_STATE", "Host can only change while waiting");
    }
    const member = this.players.get(playerId);
    if (!member) {
      throw new RoomError("PLAYER_NOT_IN_ROOM", "Player is not in this room");
    }
    if (playerId === this.hostId) {
      return;
    }
    (this.players.get(this.hostId) as RoomPlayer).isHost = false;
    member.isHost = true;
    this.hostId = playerId;
    this.touch();
  }

  start(): void {
    if (!this.canStart) {
      throw new RoomError(
        "INSUFFICIENT_PLAYERS",
        "Cannot start: all players must be ready and at least 2 must be seated",
      );
    }
    this.status = "in_progress";
    this.touch();
  }

  close(): void {
    this.status = "closed";
    this.touch();
  }

  toSnapshot(): RoomSnapshot {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      players: this.playerList,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /** Recompute lobby readinness: all-ready moves to `ready`, otherwise `waiting`. */
  private recomputeReadiness(): void {
    if (this.status !== "in_progress" && this.status !== "closed") {
      this.status = this.allReady ? "ready" : "waiting";
    }
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
