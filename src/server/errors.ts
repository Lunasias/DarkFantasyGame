import { GameError } from "../game/engine/errors";
import { RoomError } from "../game/room/errors";

/**
 * Transport-facing application error codes. These are stable, safe to return to
 * clients, and never include database errors, stack traces, or internal detail.
 */
export const APP_ERROR_CODES = [
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_NOT_JOINABLE",
  "ALREADY_IN_ROOM",
  "NOT_IN_ROOM",
  "NOT_HOST",
  "INVALID_ROOM_STATE",
  "INVALID_ACTION",
  "PLAYER_NOT_FOUND",
  "RATE_LIMITED",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/** Map known domain errors to app error codes; unknowns become an internal error. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof RoomError) {
    return new AppError(mapRoomCode(error.code), error.message);
  }
  if (error instanceof GameError) {
    return new AppError(mapGameCode(error.code), error.message);
  }
  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", "Unexpected server error");
  }
  return new AppError("INTERNAL_ERROR", "Unexpected server error");
}

function mapRoomCode(code: string): AppErrorCode {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return "ROOM_NOT_FOUND";
    case "ROOM_FULL":
      return "ROOM_FULL";
    case "ROOM_NOT_JOINABLE":
    case "ROOM_CLOSED":
      return "ROOM_NOT_JOINABLE";
    case "ALREADY_IN_ROOM":
      return "ALREADY_IN_ROOM";
    case "NOT_IN_ROOM":
      return "NOT_IN_ROOM";
    case "NOT_HOST":
      return "NOT_HOST";
    case "INVALID_ROOM_STATE":
      return "INVALID_ROOM_STATE";
    case "PLAYER_NOT_FOUND":
      return "PLAYER_NOT_FOUND";
    default:
      return "INVALID_ACTION";
  }
}

function mapGameCode(code: string): AppErrorCode {
  switch (code) {
    case "PLAYER_NOT_IN_SESSION":
    case "SESSION_NOT_FOUND":
      return "NOT_IN_ROOM";
    default:
      return "INVALID_ACTION";
  }
}
