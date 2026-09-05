import { BoardEngine } from "../board/board-engine";
import type { BoardNodeId, PlayerId } from "./types";
import { GameError } from "./errors";
import { createId } from "./id";
import { createRng, type Rng } from "./rng";
import type { TurnEngine } from "./turn-engine";

/**
 * Framework-independent, server-authoritative dice + turn movement layer.
 *
 * Flow per turn: TURN_STARTED → ROLL_REQUIRED → DICE_ROLLED → MOVEMENT_REQUIRED
 * → PLAYER_MOVED → TURN_COMPLETED → NEXT_TURN.
 *
 * The server is authoritative: a client may *request* a roll or a destination
 * but never supplies the dice value, movement distance, or a destination outside
 * the server-authorized reachable set. It composes the existing {@link TurnEngine}
 * (turn/player sequence) and {@link BoardEngine} (movement + positions) and the
 * {@link Rng} abstraction (deterministic under a seed).
 */
export type MovementEventType =
  | "ROLL_REQUIRED"
  | "DICE_ROLLED"
  | "MOVEMENT_REQUIRED"
  | "PLAYER_MOVED";

export interface MovementEvent {
  readonly id: string;
  readonly turn: number;
  readonly playerId: PlayerId;
  readonly type: MovementEventType;
  readonly sequence: number;
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}

export interface MoveTurnResult {
  readonly turn: number;
  readonly playerId: PlayerId;
  readonly dice: number;
  readonly fromNodeId: BoardNodeId;
  readonly toNodeId: BoardNodeId;
  readonly steps: number;
  readonly stateVersion: number;
}

export interface MovementEngineOptions {
  rng?: Rng;
  diceSides?: number;
}

export class MovementEngine {
  private readonly turnEngine: TurnEngine;
  private readonly board: BoardEngine;
  private readonly rng: Rng;
  private readonly diceSides: number;
  private readonly events: MovementEvent[] = [];
  private eventCounter = 0;
  private stateVersion = 0;
  private phase: "roll_required" | "movement_required" = "roll_required";
  private rolled = false;
  private moved = false;
  private dice: number | null = null;

  constructor(
    turnEngine: TurnEngine,
    board: BoardEngine,
    options: MovementEngineOptions = {},
  ) {
    this.turnEngine = turnEngine;
    this.board = board;
    this.rng = options.rng ?? createRng();
    this.diceSides = options.diceSides ?? 6;
  }

  get currentPlayer(): PlayerId | null {
    return this.turnEngine.currentPlayer;
  }

  get currentTurn(): number {
    return this.turnEngine.currentTurn;
  }

  get currentStateVersion(): number {
    return this.stateVersion;
  }

  get diceResult(): number | null {
    return this.dice;
  }

  get phaseName(): "roll_required" | "movement_required" {
    return this.phase;
  }

  get eventLog(): readonly MovementEvent[] {
    return this.events;
  }

  /** Begin the first turn (delegates to the TurnEngine). */
  start(): void {
    if (this.turnEngine.statusValue === "created") {
      this.turnEngine.start();
    }
    this.phase = "roll_required";
    this.emit("ROLL_REQUIRED");
  }

  /**
   * Roll the authoritative die for the active player's turn. Returns the result
   * in `1..diceSides` (six-sided by default for the base game).
   */
  rollDice(playerId?: PlayerId): number {
    this.requireActivePlayer(playerId);
    if (this.turnEngine.isActive === false) {
      throw new GameError("INVALID_ACTION", "Turn engine is not active");
    }
    if (this.rolled) {
      throw new GameError("DUPLICATE_ACTION", "Already rolled this turn");
    }
    if (this.phase !== "roll_required") {
      throw new GameError("INVALID_ACTION", "Cannot roll now");
    }

    this.dice = this.rng.nextInt(this.diceSides) + 1;
    this.rolled = true;
    this.stateVersion += 1;
    this.phase = "movement_required";
    this.emit("DICE_ROLLED", { value: this.dice });
    this.emit("MOVEMENT_REQUIRED", { maxSteps: this.dice });
    return this.dice;
  }

  /** Server-authorized destinations for the rolled distance. */
  reachableDestinations(playerId?: PlayerId): BoardNodeId[] {
    const active = this.requireActivePlayer(playerId);
    if (!this.rolled || this.dice === null) {
      throw new GameError("INVALID_ACTION", "Roll dice before computing moves");
    }
    return this.board.reachable(active, this.dice);
  }

  /**
   * Resolve the active player's move to a destination and complete the turn.
   * Destination must be within the rolled distance; the server validates it.
   */
  move(destId: BoardNodeId, playerId?: PlayerId): MoveTurnResult {
    const active = this.requireActivePlayer(playerId);
    if (!this.rolled || this.dice === null) {
      throw new GameError("INVALID_ACTION", "Roll dice before moving");
    }
    if (this.moved) {
      throw new GameError("DUPLICATE_ACTION", "Already moved this turn");
    }
    const from = this.board.getPosition(active);
    if (!from) {
      throw new GameError("INVALID_ACTION", "Player is not placed on the board");
    }
    if (!this.board.canMove(active, destId, this.dice)) {
      throw new GameError(
        "INVALID_ACTION",
        `Destination "${destId}" is not reachable within ${this.dice} step(s)`,
      );
    }

    // Authoritative movement via the BoardEngine.
    const result = this.board.move(active, destId, { maxSteps: this.dice });
    this.moved = true;
    this.stateVersion += 1;
    this.emit("PLAYER_MOVED", {
      playerId: active,
      from: result.fromNodeId,
      to: result.toNodeId,
      steps: result.path.length - 1,
      maxSteps: this.dice,
    });

    const resolution: MoveTurnResult = {
      turn: this.currentTurn,
      playerId: active,
      dice: this.dice,
      fromNodeId: result.fromNodeId,
      toNodeId: result.toNodeId,
      steps: result.path.length - 1,
      stateVersion: this.stateVersion,
    };

    // Complete the turn → advance to the next player (TurnEngine owns the order).
    this.turnEngine.submitAction({ type: "end_turn", playerId: active });
    this.phase = "roll_required";
    this.rolled = false;
    this.moved = false;
    this.dice = null;
    this.emit("ROLL_REQUIRED");
    return resolution;
  }

  private requireActivePlayer(playerId?: PlayerId): PlayerId {
    const active = this.turnEngine.currentPlayer;
    if (!active) {
      throw new GameError("INVALID_ACTION", "No active turn");
    }
    if (playerId && playerId !== active) {
      throw new GameError("NOT_ACTIVE_PLAYER", "It is not this player's turn");
    }
    return active;
  }

  private emit(type: MovementEventType, data?: Record<string, unknown>): void {
    this.eventCounter += 1;
    this.events.push({
      id: createId(),
      turn: this.currentTurn,
      playerId: this.currentPlayer ?? "",
      type,
      sequence: this.eventCounter,
      data,
      timestamp: Date.now(),
    });
  }
}
