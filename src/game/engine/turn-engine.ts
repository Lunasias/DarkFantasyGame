import { isActionType, type Action } from "./action";
import { GameError } from "./errors";
import { createId } from "./id";
import { createRng, type Rng } from "./rng";
import type { PlayerId, SessionId, TurnNumber } from "./types";

/**
 * Deterministic turn lifecycle.
 *
 *   TURN_CREATED → PLAYER_ACTION_REQUIRED → ACTION_VALIDATED → ACTION_RESOLVED
 *     → STATE_UPDATED → TURN_COMPLETED → NEXT_TURN
 *
 * The engine is the authoritative turn authority. Clients may *request* an
 * action but never determine the current turn, active player, action validity,
 * resulting state, state version, event sequence, or turn completion. All of it
 * is derived here from the authoritative state.
 */
export const TURN_LIFECYCLE = [
  "created",
  "player_action_required",
  "action_validated",
  "action_resolved",
  "state_updated",
  "turn_completed",
  "next_turn",
] as const;

export type TurnPhase = (typeof TURN_LIFECYCLE)[number];

export const TURN_EVENT_TYPES = [
  "TURN_STARTED",
  "ACTION_ACCEPTED",
  "ACTION_REJECTED",
  "ACTION_RESOLVED",
  "TURN_COMPLETED",
] as const;

export type TurnEventType = (typeof TURN_EVENT_TYPES)[number];

export interface TurnEvent {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly turn: TurnNumber;
  readonly type: TurnEventType;
  readonly playerId: PlayerId | null;
  readonly sequence: number;
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}

/** Result of a resolved action for a given (authoritative) turn. */
export interface TurnResolution {
  readonly turn: TurnNumber;
  readonly playerId: PlayerId;
  readonly stateVersion: number;
  readonly action: Action;
  readonly result: Readonly<Record<string, unknown>>;
}

export interface TurnEngineOptions {
  /** Starting state version (monotonic). */
  stateVersion?: number;
  /** Injected RNG (deterministic when seeded). */
  rng?: Rng;
  /** Injected clock for fully deterministic test/replay timestamps. */
  now?: () => number;
}

const MIN_PLAYERS = 2;

export class TurnEngine {
  readonly sessionId: SessionId;
  private readonly players: readonly PlayerId[];
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly events: TurnEvent[] = [];
  private readonly applied = new Map<TurnNumber, string>();
  private readonly resolutions = new Map<TurnNumber, TurnResolution>();
  private status: "created" | "active" | "finished" = "created";
  private phase: TurnPhase = "created";
  private turnNumber = 0;
  private currentPlayerId: PlayerId | null = null;
  private eventCounter = 0;
  private stateVersion: number;

  constructor(sessionId: SessionId, players: readonly PlayerId[], options: TurnEngineOptions = {}) {
    if (players.length < MIN_PLAYERS) {
      throw new GameError("INVALID_ACTION", `At least ${MIN_PLAYERS} players are required`);
    }
    this.sessionId = sessionId;
    this.players = [...players];
    this.rng = options.rng ?? createRng();
    this.now = options.now ?? (() => Date.now());
    this.stateVersion = options.stateVersion ?? 0;
  }

  get statusValue(): "created" | "active" | "finished" {
    return this.status;
  }

  get isActive(): boolean {
    return this.status === "active";
  }

  get phaseName(): TurnPhase {
    return this.phase;
  }

  get currentTurn(): TurnNumber {
    return this.turnNumber;
  }

  get currentPlayer(): PlayerId | null {
    return this.currentPlayerId;
  }

  get currentStateVersion(): number {
    return this.stateVersion;
  }

  get eventLog(): readonly TurnEvent[] {
    return this.events;
  }

  /** Exposes the injected randomness source (for future seeded dice/rolls). */
  get randomSource(): Rng {
    return this.rng;
  }

  /** Begin the session: create the first turn for the first seated player. */
  start(): void {
    if (this.status !== "created") {
      throw new GameError("INVALID_ACTION", "Turn engine has already started");
    }
    this.status = "active";
    this.beginNextTurn();
  }

  /**
   * Submit one action for the current turn. Returns the deterministic
   * resolution. Invalid actions are rejected (and an ACTION_REJECTED event is
   * recorded) without mutating authoritative state.
   */
  submitAction(
    action: Action,
    opts: { expectedTurn?: TurnNumber; idempotencyKey?: string } = {},
  ): TurnResolution {
    if (this.status !== "active") {
      throw new GameError("INVALID_ACTION", "Turn engine is not active");
    }
    if (action.playerId === undefined || action.playerId === "") {
      throw new GameError("INVALID_ACTION", "Action is missing a player");
    }
    if (!this.players.includes(action.playerId)) {
      this.reject(action, "Player is not in this session");
      throw new GameError("PLAYER_NOT_IN_SESSION", "Player is not in this session");
    }
    if (!isActionType(action.type)) {
      this.reject(action, "Unknown action type");
      throw new GameError("INVALID_ACTION", "Unknown action type");
    }

    const key = opts.idempotencyKey ?? this.fingerprint(action);
    const turn = opts.expectedTurn ?? this.currentTurn;

    // Idempotency first: a repeated submission of the SAME action (same key) is
    // a no-op that returns the stored resolution — it never executes twice.
    if (this.applied.get(turn) === key && this.resolutions.has(turn)) {
      return this.resolutions.get(turn) as TurnResolution;
    }

    // Stale request for an already-advanced turn.
    if (turn !== this.currentTurn) {
      this.reject(action, "Action is for a stale turn");
      throw new GameError("STALE_ACTION", "Action is for a stale turn");
    }

    // A different action for an already-resolved turn is a duplicate mutation.
    if (this.resolutions.has(turn)) {
      this.reject(action, "Turn already resolved");
      throw new GameError("DUPLICATE_ACTION", "A different action was already applied this turn");
    }

    if (this.currentPlayerId !== action.playerId) {
      this.reject(action, "It is not this player's turn");
      throw new GameError("NOT_ACTIVE_PLAYER", "It is not this player's turn");
    }

    // Accept + resolve deterministically, then advance the state version.
    this.phase = "action_validated";
    this.emit("ACTION_ACCEPTED", action.playerId, {
      turn,
      type: action.type,
      stateVersion: this.currentStateVersion,
    });

    const result = this.resolve(action);

    this.phase = "action_resolved";
    this.emit("ACTION_RESOLVED", action.playerId, {
      turn,
      type: action.type,
      result,
      stateVersion: this.currentStateVersion,
    });

    this.stateVersion += 1;
    this.phase = "state_updated";
    this.emit("TURN_COMPLETED", action.playerId, {
      turn,
      stateVersion: this.currentStateVersion,
    });

    const resolution: TurnResolution = {
      turn,
      playerId: action.playerId,
      stateVersion: this.currentStateVersion,
      action,
      result,
    };
    this.resolutions.set(turn, resolution);
    this.applied.set(turn, key);

    // NEXT_TURN → begin the next authoritative turn.
    this.phase = "next_turn";
    this.beginNextTurn();
    return resolution;
  }

  /** Finish the match; further actions are rejected. */
  finish(): void {
    if (this.status !== "active") {
      throw new GameError("INVALID_ACTION", "Turn engine is not active");
    }
    this.status = "finished";
    this.currentPlayerId = null;
    this.phase = "turn_completed";
  }

  /** Resolve an action into a deterministic result (no randomness in Phase 2). */
  private resolve(action: Action): Readonly<Record<string, unknown>> {
    return {
      actor: action.playerId,
      action: action.type,
      turn: this.currentTurn,
      stateVersion: this.currentStateVersion,
    };
  }

  private reject(action: Action, message: string): void {
    this.emit("ACTION_REJECTED", action.playerId, {
      turn: this.currentTurn,
      type: action.type,
      reason: message,
    });
  }

  private beginNextTurn(): void {
    this.turnNumber += 1;
    const index = (this.turnNumber - 1) % this.players.length;
    this.currentPlayerId = this.players[index];
    this.phase = "player_action_required";
    this.emit("TURN_STARTED", this.currentPlayerId, {
      turn: this.turnNumber,
      stateVersion: this.currentStateVersion,
    });
  }

  private fingerprint(action: Action): string {
    return `${action.playerId}:${action.type}:${JSON.stringify(action.payload ?? {})}`;
  }

  private emit(type: TurnEventType, playerId: PlayerId | null, data?: Record<string, unknown>): void {
    this.eventCounter += 1;
    this.events.push({
      id: createId(),
      sessionId: this.sessionId,
      turn: this.currentTurn,
      type,
      playerId,
      sequence: this.eventCounter,
      data,
      timestamp: this.now(),
    });
  }
}
