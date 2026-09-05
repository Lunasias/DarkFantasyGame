import type { PlayerId, RoomId } from "../engine/types";

/**
 * Room lifecycle state machine.
 *
 *   waiting → starting → in_game → finished → closed
 *
 * `waiting` is the joiniable lobby; `starting` is a brief window after the host
 * triggers start (before the session row is created); `in_game` is live play;
 * `finished` means the match ended; `closed` is terminal.
 *
 * The only transitions (enforced in `state-machine.ts`) are:
 *   waiting  → starting | closed
 *   starting → in_game | closed
 *   in_game  → finished
 *   finished → closed
 */
export const ROOM_STATUSES = [
  "waiting",
  "starting",
  "in_game",
  "finished",
  "closed",
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** A room is joinable only while it is still in the lobby. */
export const JOINABLE_STATUSES: readonly RoomStatus[] = ["waiting"];

export type RoomVisibility = "public" | "private";

/** A member seated in a room. Deliberately lightweight and transport-aware. */
export interface RoomPlayer {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly slot: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  readonly joinedAt: number;
  lastSeenAt: number;
}

/** Default and hard bounds. Room size is part of the scalable-design goal. */
export const MIN_PLAYERS = 2;
export const DEFAULT_MAX_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export interface RoomOptions {
  id?: RoomId;
  code?: string;
  name: string;
  hostId: PlayerId;
  hostName: string;
  maxPlayers?: number;
  gameMode?: string;
  ruleset?: string;
  visibility?: RoomVisibility;
}

export interface RoomSnapshot {
  readonly id: RoomId;
  readonly code: string;
  readonly name: string;
  readonly status: RoomStatus;
  readonly hostId: PlayerId;
  readonly maxPlayers: number;
  readonly gameMode: string;
  readonly ruleset: string;
  readonly visibility: RoomVisibility;
  readonly players: readonly RoomPlayer[];
  readonly createdAt: number;
  readonly updatedAt: number;
}
