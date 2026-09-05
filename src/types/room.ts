import type {
  RoomStatus,
  RoomVisibility,
} from "../game/room/types";

/** Serializable room member (never includes internal columns). */
export interface RoomMemberView {
  readonly userId: string;
  readonly displayName: string;
  readonly slot: number;
  readonly isHost: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly joinedAt: string;
  readonly lastSeenAt: string | null;
}

/** Serializable, client-safe snapshot of a room. */
export interface RoomView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: RoomStatus;
  readonly hostId: string;
  readonly maxPlayers: number;
  readonly gameMode: string;
  readonly ruleset: string;
  readonly visibility: RoomVisibility;
  readonly players: readonly RoomMemberView[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Serializable room event (client-safe, with server-assigned sequence). */
export interface RoomEventView {
  readonly id: string;
  readonly roomId: string;
  readonly actorId: string | null;
  readonly type: string;
  readonly sequence: number;
  readonly payload: unknown;
  readonly createdAt: string;
}

/** Public, non-member-safe room preview (no member identities). */
export interface RoomJoinPreview {
  readonly code: string;
  readonly name: string;
  readonly status: RoomStatus;
  readonly maxPlayers: number;
  readonly playerCount: number;
  readonly visibility: RoomVisibility;
  readonly canJoin: boolean;
}
