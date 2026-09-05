import type { PlayerId, RoomId } from "../engine/types";

/**
 * Room lifecycle. A room starts `waiting`; when every member is ready it
 * becomes `ready` and the host can `start` it, moving it to `in_progress`.
 * A room is `closed` when emptied or finished.
 */
export const ROOM_STATUSES = [
  "waiting",
  "ready",
  "in_progress",
  "closed",
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** A member seated in a room. Deliberately lightweight and transport-aware. */
export interface RoomPlayer {
  readonly playerId: PlayerId;
  readonly name: string;
  isHost: boolean;
  ready: boolean;
  readonly joinedAt: number;
}

/** Default and hard bounds. Room size is part of the scalable-design goal. */
export const MIN_PLAYERS = 2;
export const DEFAULT_MAX_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export interface RoomOptions {
  id?: RoomId;
  name: string;
  hostId: PlayerId;
  hostName: string;
  maxPlayers?: number;
}

export interface RoomSnapshot {
  readonly id: RoomId;
  readonly name: string;
  readonly status: RoomStatus;
  readonly hostId: PlayerId;
  readonly maxPlayers: number;
  readonly players: readonly RoomPlayer[];
  readonly createdAt: number;
  readonly updatedAt: number;
}
