/**
 * Typed error model for the simulation engine.
 *
 * Throwing a `GameError` (rather than a generic `Error`) lets callers switch on
 * a stable `code` to present a friendly message, retry, or reject an invalid
 * client action without parsing a string. This is framework-independent and
 * safe to throw from both the server and the engine.
 */

export const GAME_ERROR_CODES = [
  "SESSION_NOT_FOUND",
  "SESSION_ALREADY_STARTED",
  "SESSION_NOT_STARTED",
  "SESSION_FULL",
  "PLAYER_NOT_IN_SESSION",
  "PLAYER_ALREADY_IN_SESSION",
  "BOARD_NODE_NOT_FOUND",
  "TURN_OUT_OF_ORDER",
  "INVALID_ACTION",
] as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export class GameError extends Error {
  readonly code: GameErrorCode;

  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}

/** Convenience factories that keep call sites terse and code-names consistent. */
export function sessionNotFound(message = "Session not found"): GameError {
  return new GameError("SESSION_NOT_FOUND", message);
}

export function sessionAlreadyStarted(
  message = "Session has already started",
): GameError {
  return new GameError("SESSION_ALREADY_STARTED", message);
}

export function sessionNotStarted(
  message = "Session has not started yet",
): GameError {
  return new GameError("SESSION_NOT_STARTED", message);
}

export function sessionFull(
  maxPlayers: number,
  message?: string,
): GameError {
  return new GameError(
    "SESSION_FULL",
    message ?? `Session is full (max ${maxPlayers} players)`,
  );
}

export function boardNodeNotFound(nodeId: string): GameError {
  return new GameError("BOARD_NODE_NOT_FOUND", `Board node "${nodeId}" not found`);
}
