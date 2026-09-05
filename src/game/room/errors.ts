export const ROOM_ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_NOT_JOINABLE",
  "ALREADY_IN_ROOM",
  "NOT_IN_ROOM",
  "NOT_HOST",
  "INVALID_ROOM_STATE",
  "INSUFFICIENT_PLAYERS",
  "INVALID_ACTION",
  "PLAYER_NOT_FOUND",
  "ROOM_CLOSED",
] as const;

export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

export function roomNotFound(roomId: string): RoomError {
  return new RoomError("ROOM_NOT_FOUND", `Room "${roomId}" not found`);
}
