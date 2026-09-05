/**
 * Core shared types for the DarkFantasyGame simulation engine.
 *
 * The engine is intentionally framework-independent: it must NOT depend on
 * React, Three.js, or any server framework. Every module in this folder is
 * plain TypeScript that can run under Node.js, in tests, and (later) on the
 * server.
 */

/** Stable identifier used across the whole domain. */
export type EntityId = string;

export type SessionId = EntityId;
export type PlayerId = EntityId;
export type CharacterId = EntityId;
export type RoomId = EntityId;
export type BoardNodeId = EntityId;
export type TurnNumber = number;

/**
 * The lifecycle phase of a game session.
 *
 * - `lobby`    – players are still joining / preparing.
 * - `active`   – the turn-based board game is being played.
 * - `finished` – the session reached its end condition.
 */
export type SessionPhase = "lobby" | "active" | "finished";

/** Collection of the player-facing identity attached to every participant. */
export interface PlayerIdentity {
  readonly id: PlayerId;
  readonly name: string;
}
