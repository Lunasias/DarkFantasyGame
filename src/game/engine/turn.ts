import { createId } from "./id";
import type { EntityId, PlayerId, SessionId, TurnNumber } from "./types";

/**
 * A single discrete turn in a session. Turns are the core unit of progression:
 * they identify *whose* turn it is and the 1-based ordinal position.
 *
 * A turn is intentionally a plain record with behaviour attached via the
 * session, so it can be serialized and rehydrated without ceremony.
 */
export class Turn {
  readonly id: EntityId;
  readonly sessionId: SessionId;
  readonly number: TurnNumber;
  readonly playerId: PlayerId;
  readonly startedAt: number;

  constructor(
    sessionId: SessionId,
    number: TurnNumber,
    playerId: PlayerId,
  ) {
    if (number < 1) {
      throw new Error("Turn number must be a positive integer");
    }
    this.id = createId();
    this.sessionId = sessionId;
    this.number = number;
    this.playerId = playerId;
    this.startedAt = Date.now();
  }
}
