import { createId } from "./id";
import type { PlayerId } from "./types";

/**
 * A Participant in a game session. A `Player` is the transport-facing identity
 * (session seat); the in-world avatar they control is a {@link Character}.
 *
 * The engine treats the player purely as an identity holder so that it can stay
 * framework-independent: a server can attach connection/auth metadata to the
 * same id without the engine knowing about it.
 */
export class Player {
  readonly id: PlayerId;
  name: string;

  constructor(id: PlayerId, name: string) {
    if (name.trim().length === 0) {
      throw new Error("Player name must not be empty");
    }
    this.id = id;
    this.name = name;
  }

  /** Give the player a new display name, trimming surrounding whitespace. */
  rename(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("Player name must not be empty");
    }
    this.name = trimmed;
  }
}

/** Convenience factory: creates a player with a fresh id. */
export function createPlayer(name: string): Player {
  return new Player(createId(), name);
}
