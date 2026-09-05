import { createId } from "./id";
import type { EntityId, SessionId } from "./types";

/** Every kind of domain event a session can emit. */
export const GAME_EVENT_TYPES = [
  "game_started",
  "player_joined",
  "player_left",
  "turn_started",
  "turn_ended",
  "action_resolved",
  "game_finished",
] as const;

export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

/**
 * An immutable, append-only domain event. Game events are the engine's output
 * channel: the server can persist them (see `game_events` table) and broadcast
 * them over the realtime transport so clients can reconcile state without
 * trusting a full snapshot on every tick.
 */
export interface GameEvent {
  readonly id: EntityId;
  readonly sessionId: SessionId;
  readonly type: GameEventType;
  readonly timestamp: number;
  readonly data?: Record<string, unknown>;
}

/** Factory that stamps a fresh id and timestamp. */
export function createGameEvent(
  sessionId: SessionId,
  type: GameEventType,
  data?: Record<string, unknown>,
): GameEvent {
  return {
    id: createId(),
    sessionId,
    type,
    timestamp: Date.now(),
    data,
  };
}
