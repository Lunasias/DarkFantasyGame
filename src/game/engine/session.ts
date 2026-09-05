import { createId } from "./id";
import { Board } from "../board/board";
import {
  GameError,
  sessionAlreadyStarted,
  sessionFull,
  sessionNotStarted,
} from "./errors";
import type { Action } from "./action";
import { createGameEvent, type GameEvent } from "./event";
import { Player } from "./player";
import { Turn } from "./turn";
import type { PlayerId, SessionId, SessionPhase } from "./types";

export interface CreateSessionOptions {
  id?: SessionId;
  name?: string;
  maxPlayers?: number;
  board?: Board;
}

/**
 * The authoritative, deterministic game state for one match.
 *
 * `GameSession` owns the rules that mutate state ("lobby -> active", turn
 * rotation, action validation) and emits an append-only {@link GameEvent} log.
 * It has zero framework dependencies, so the same instance can be driven by the
 * server during a turn and fully reproduced in a state-diff or replay.
 */
export class GameSession {
  readonly id: SessionId;
  readonly name: string;
  readonly maxPlayers: number;
  phase: SessionPhase;
  currentTurn: Turn | null;
  private readonly players = new Map<PlayerId, Player>();
  private readonly boardRef: Board;
  private readonly events: GameEvent[] = [];
  private turnCounter = 0;

  constructor(options: CreateSessionOptions = {}) {
    this.id = options.id ?? createId();
    this.name = options.name?.trim() || "New Session";
    const maxPlayers = options.maxPlayers ?? 4;
    if (maxPlayers < 2 || maxPlayers > 16) {
      throw new Error("maxPlayers must be between 2 and 16");
    }
    this.maxPlayers = maxPlayers;
    this.phase = "lobby";
    this.currentTurn = null;
    this.boardRef = options.board ?? new Board();
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get playerList(): readonly Player[] {
    return [...this.players.values()];
  }

  get board(): Board {
    return this.boardRef;
  }

  get eventLog(): readonly GameEvent[] {
    return this.events;
  }

  get currentTurnNumber(): number {
    return this.turnCounter;
  }

  /** Seat a player during the lobby phase. Throws if the session is full. */
  addPlayer(player: Player): void {
    if (this.phase !== "lobby") {
      throw sessionAlreadyStarted();
    }
    if (this.players.has(player.id)) {
      throw new GameError(
        "PLAYER_ALREADY_IN_SESSION",
        "Player is already seated in this session",
      );
    }
    if (this.isFull) {
      throw sessionFull(this.maxPlayers);
    }
    this.players.set(player.id, player);
    this.events.push(
      createGameEvent(this.id, "player_joined", { playerId: player.id }),
    );
  }

  /** Unseat a player. Leaving is only allowed in the lobby phase. */
  removePlayer(playerId: PlayerId): void {
    if (!this.players.has(playerId)) {
      throw new GameError("PLAYER_NOT_IN_SESSION", "Player is not in this session");
    }
    if (this.phase !== "lobby") {
      throw new GameError(
        "INVALID_ACTION",
        "Players cannot leave an active session",
      );
    }
    this.players.delete(playerId);
    this.events.push(createGameEvent(this.id, "player_left", { playerId }));
  }

  /** Transition the session from the lobby to active play. */
  start(): void {
    if (this.phase !== "lobby") {
      throw sessionAlreadyStarted();
    }
    if (this.players.size === 0) {
      throw new GameError("INVALID_ACTION", "Cannot start a session with no players");
    }
    this.phase = "active";
    this.events.push(createGameEvent(this.id, "game_started"));
    this.beginNextTurn();
  }

  /** Finish the match (called by an end condition in a later phase). */
  finish(): void {
    if (this.phase !== "active") {
      throw sessionNotStarted("Session is not active and cannot be finished");
    }
    this.phase = "finished";
    this.currentTurn = null;
    this.events.push(createGameEvent(this.id, "game_finished"));
  }

  /**
   * Apply a player action. In Phase 0 only `end_turn` has full behaviour (it
   * advances the turn); other action types are validated and recorded but not
   * yet simulated. This keeps the engine testable without a combat system.
   */
  submitAction(action: Action): void {
    if (this.phase !== "active") {
      throw sessionNotStarted();
    }
    const turn = this.currentTurn;
    if (!turn) {
      throw sessionNotStarted("No active turn");
    }
    if (action.playerId !== turn.playerId) {
      throw new GameError("TURN_OUT_OF_ORDER", "It is not this player's turn");
    }

    if (action.type === "end_turn") {
      this.events.push(createGameEvent(this.id, "turn_ended", { turn: turn.number }));
      this.beginNextTurn();
      return;
    }

    this.events.push(
      createGameEvent(this.id, "action_resolved", {
        playerId: action.playerId,
        type: action.type,
        turn: turn.number,
      }),
    );
  }

  private beginNextTurn(): void {
    this.turnCounter += 1;
    const order = this.playerList;
    const actorId = order[(this.turnCounter - 1) % order.length].id;
    this.currentTurn = new Turn(this.id, this.turnCounter, actorId);
    this.events.push(
      createGameEvent(this.id, "turn_started", {
        turn: this.turnCounter,
        playerId: actorId,
      }),
    );
  }
}

/** Convenience factory for a fresh session. */
export function createSession(options: CreateSessionOptions = {}): GameSession {
  return new GameSession(options);
}
