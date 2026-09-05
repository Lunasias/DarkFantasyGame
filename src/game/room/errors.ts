export const ROOM_ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_IN_PROGRESS",
  "ROOM_CLOSED",
  "PLAYER_ALREADY_JOINED",
  "PLAYER_NOT_IN_ROOM",
  "NOT_HOST",
  "INSUFFICIENT_PLAYERS",
  "INVALID_STATE",
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
