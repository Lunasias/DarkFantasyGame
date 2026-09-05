import { createId } from "../engine/id";
import type { PlayerId, RoomId } from "../engine/types";
import { generateRoomCode } from "./code";
import { RoomError } from "./errors";
import { assertTransition } from "./state-machine";
import {
  DEFAULT_MAX_PLAYERS,
  JOINABLE_STATUSES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type RoomOptions,
  type RoomPlayer,
  type RoomSnapshot,
  type RoomStatus,
  type RoomVisibility,
} from "./types";

/**
 * A `Room` is the pure domain model of a pre-game lobby.
 *
 * It holds state, allocates seats, and enforces state-machine transitions, but
 * knows nothing about networking, persistence, or auth. The authoritative
 * server layer (`src/server`) drives persistence + realtime and re-uses this
 * state machine so the rules never diverge between domain and server.
 */
export class Room {
  readonly id: RoomId;
  readonly code: string;
  readonly name: string;
  readonly maxPlayers: number;
  readonly gameMode: string;
  readonly ruleset: string;
  readonly visibility: RoomVisibility;
  readonly createdAt: number;
  private status: RoomStatus;
  private hostId: PlayerId;
  private updatedAt: number;
  private readonly players = new Map<PlayerId, RoomPlayer>();
  private readonly slots = new Set<number>();

  constructor(options: RoomOptions) {
    this.id = options.id ?? createId();
    this.code = options.code ?? generateRoomCode();
    const name = options.name.trim();
    if (name.length === 0) {
      throw new RoomError("INVALID_ACTION", "Room name must not be empty");
    }
    const maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
      throw new RoomError(
        "INVALID_ACTION",
        `maxPlayers must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`,
      );
    }
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.gameMode = options.gameMode ?? "standard";
    this.ruleset = options.ruleset ?? "classic";
    this.visibility = options.visibility ?? "public";
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.status = "waiting";
    this.hostId = options.hostId;
    this.seat(options.hostId, options.hostName, 0, true, true);
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

  get isJoinable(): boolean {
    return JOINABLE_STATUSES.includes(this.status) && !this.isFull;
  }

  get playerList(): readonly RoomPlayer[] {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot);
  }

  get allReady(): boolean {
    return (
      this.players.size > 0 &&
      [...this.players.values()].every((player) => player.ready)
    );
  }

  get canStart(): boolean {
    return (
      this.status === "waiting" &&
      this.players.size >= MIN_PLAYERS &&
      this.allReady
    );
  }

  addPlayer(playerId: PlayerId, name: string): RoomPlayer {
    if (!this.isJoinable) {
      throw new RoomError(
        this.isFull ? "ROOM_FULL" : "ROOM_NOT_JOINABLE",
        this.isFull
          ? `Room is full (${this.maxPlayers})`
          : `Room is not joinable in state ${this.status}`,
      );
    }
    if (this.players.has(playerId)) {
      throw new RoomError("ALREADY_IN_ROOM", "Player is already in this room");
    }
    const slot = this.nextFreeSlot();
    return this.seat(playerId, name, slot, false, true);
  }

  removePlayer(playerId: PlayerId): void {
    const member = this.players.get(playerId);
    if (!member) {
      throw new RoomError("NOT_IN_ROOM", "Player is not in this room");
    }
    if (this.status !== "waiting" && this.status !== "finished") {
      throw new RoomError(
        "INVALID_ROOM_STATE",
        "Players can only be removed while the room is in the lobby",
      );
    }
    this.unseat(playerId);

    if (this.players.size === 0) {
      this.transitionTo("closed");
      return;
    }
    if (this.hostId === playerId) {
      const next = this.nextConnectedMember();
      this.setHostInner(next ?? this.firstMemberId()!);
    }
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    const member = this.requireMember(playerId);
    if (this.status !== "waiting") {
      throw new RoomError(
        "INVALID_ROOM_STATE",
        "Readiness can only change while the room is waiting",
      );
    }
    member.ready = ready;
    this.touch();
  }

  /** Transfer host: only the current host may do this, to a seated member. */
  transferHost(actorId: PlayerId, targetId: PlayerId): void {
    this.assertHost(actorId);
    if (this.status !== "waiting") {
      throw new RoomError(
        "INVALID_ROOM_STATE",
        "Host can only be transferred while the room is waiting",
      );
    }
    this.requireMember(targetId);
    this.setHostInner(targetId);
  }

  /** Kick a member: only the host may kick a non-host seated member. */
  kick(actorId: PlayerId, targetId: PlayerId): void {
    this.assertHost(actorId);
    if (this.status !== "waiting" && this.status !== "finished") {
      throw new RoomError(
        "INVALID_ROOM_STATE",
        "Players can only be removed while the room is in the lobby",
      );
    }
    if (targetId === actorId) {
      throw new RoomError("INVALID_ACTION", "The host cannot kick themselves");
    }
    this.requireMember(targetId);
    this.removePlayer(targetId);
  }

  /** Host starts the match: waiting → starting. */
  start(actorId: PlayerId): void {
    this.assertHost(actorId);
    if (!this.canStart) {
      throw new RoomError(
        "INSUFFICIENT_PLAYERS",
        "Cannot start: all players must be ready and at least 2 must be seated",
      );
    }
    this.transitionTo("starting");
  }

  /** The matched session row was created: starting → in_game. */
  beginGame(): void {
    this.transitionTo("in_game");
  }

  /** End the match: in_game → finished. */
  finish(): void {
    this.transitionTo("finished");
  }

  /** Close a room (waiting / starting / finished → closed). */
  close(): void {
    this.transitionTo("closed");
  }

  /** Reconnect-foundation: mark presence without changing the seat. */
  setConnected(playerId: PlayerId, connected: boolean): void {
    const member = this.requireMember(playerId);
    member.connected = connected;
    member.lastSeenAt = Date.now();
    this.touch();
  }

  toSnapshot(): RoomSnapshot {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      status: this.status,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      gameMode: this.gameMode,
      ruleset: this.ruleset,
      visibility: this.visibility,
      players: this.playerList,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  private seat(
    playerId: PlayerId,
    name: string,
    slot: number,
    isHost: boolean,
    connected: boolean,
  ): RoomPlayer {
    const member: RoomPlayer = {
      playerId,
      name,
      slot,
      isHost,
      ready: false,
      connected,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    this.players.set(playerId, member);
    this.slots.add(slot);
    this.touch();
    return member;
  }

  private unseat(playerId: PlayerId): void {
    const member = this.players.get(playerId);
    if (member) {
      this.players.delete(playerId);
      this.slots.delete(member.slot);
    }
    this.touch();
  }

  private nextFreeSlot(): number {
    const used = new Set(this.slots);
    let slot = 0;
    while (used.has(slot)) slot += 1;
    if (slot >= this.maxPlayers) {
      throw new RoomError("ROOM_FULL", `Room is full (${this.maxPlayers})`);
    }
    return slot;
  }

  private requireMember(playerId: PlayerId): RoomPlayer {
    const member = this.players.get(playerId);
    if (!member) {
      throw new RoomError("NOT_IN_ROOM", "Player is not in this room");
    }
    return member;
  }

  private assertHost(actorId: PlayerId): void {
    if (actorId !== this.hostId) {
      throw new RoomError("NOT_HOST", "Only the host can perform this action");
    }
  }

  private setHostInner(newHostId: PlayerId): void {
    const previous = this.players.get(this.hostId);
    if (previous) {
      previous.isHost = false;
    }
    const next = this.players.get(newHostId);
    if (!next) {
      throw new RoomError("NOT_IN_ROOM", "New host must be a seated member");
    }
    next.isHost = true;
    this.hostId = newHostId;
    this.touch();
  }

  private nextConnectedMember(): PlayerId | undefined {
    const connected = this.playerList.find((p) => p.connected);
    return connected?.playerId;
  }

  private firstMemberId(): PlayerId | undefined {
    return this.playerList[0]?.playerId;
  }

  private transitionTo(next: RoomStatus): void {
    assertTransition(this.status, next);
    this.status = next;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
