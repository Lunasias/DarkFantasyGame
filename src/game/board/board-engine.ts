import { boardNodeNotFound, GameError } from "../engine/errors";
import { createId } from "../engine/id";
import type { BoardNodeId, PlayerId } from "../engine/types";
import { Board } from "./board";

/**
 * Framework-independent, server-authoritative board domain.
 *
 * Holds player positions and resolves movement. Clients may request a
 * destination but never set a position, alter the graph, or dictate a movement
 * result — all of that is derived here from the authoritative {@link Board} and
 * the deterministic `moveDistance` supplied by the (seeding) rule layer.
 */
export type BoardEventType = "PLAYER_POSITION_CHANGED";

export interface BoardEvent {
  readonly id: string;
  readonly boardId: string;
  readonly type: BoardEventType;
  readonly playerId: PlayerId;
  readonly fromNodeId: BoardNodeId;
  readonly toNodeId: BoardNodeId;
  readonly sequence: number;
  readonly timestamp: number;
}

export interface MoveResult {
  readonly playerId: PlayerId;
  readonly fromNodeId: BoardNodeId;
  readonly toNodeId: BoardNodeId;
  readonly path: readonly BoardNodeId[];
  readonly stateVersion: number;
}

export class BoardEngine {
  readonly board: Board;
  private readonly positions = new Map<PlayerId, BoardNodeId>();
  private readonly events: BoardEvent[] = [];
  private eventCounter = 0;
  private stateVersion = 0;

  constructor(board: Board) {
    this.board = board;
    board.assertValid();
  }

  /** Server-side initial placement (never client-controlled). */
  place(playerId: PlayerId, nodeId: BoardNodeId): void {
    if (!this.board.getNode(nodeId)) {
      throw boardNodeNotFound(nodeId);
    }
    this.positions.set(playerId, nodeId);
  }

  /** Current authoritative node for a player, or null if not placed. */
  getPosition(playerId: PlayerId): BoardNodeId | null {
    return this.positions.get(playerId) ?? null;
  }

  /** Deterministic reachable nodes (id order) for a placed player. */
  reachable(playerId: PlayerId, maxSteps: number): BoardNodeId[] {
    const from = this.requirePosition(playerId);
    return this.board.reachableWithin(from, maxSteps);
  }

  /** True if the player can reach `destId` within `maxSteps`. */
  canMove(playerId: PlayerId, destId: BoardNodeId, maxSteps: number): boolean {
    return this.reachable(playerId, maxSteps).includes(destId);
  }

  /** Resolve a deterministic move, updating authoritative position. */
  move(playerId: PlayerId, destId: BoardNodeId, opts: { maxSteps: number }): MoveResult {
    const from = this.requirePosition(playerId);
    if (!this.board.getNode(from)) {
      throw boardNodeNotFound(from);
    }
    if (!this.board.getNode(destId)) {
      throw boardNodeNotFound(destId);
    }
    const path = this.board.shortestPathWithin(from, destId, opts.maxSteps);
    if (!path) {
      throw new GameError(
        "INVALID_ACTION",
        `Node "${destId}" is not reachable within ${opts.maxSteps} step(s)`,
      );
    }

    this.positions.set(playerId, destId);
    this.stateVersion += 1;
    this.events.push({
      id: createId(),
      boardId: this.board.id,
      type: "PLAYER_POSITION_CHANGED",
      playerId,
      fromNodeId: from,
      toNodeId: destId,
      sequence: (this.eventCounter += 1),
      timestamp: Date.now(),
    });

    return {
      playerId,
      fromNodeId: from,
      toNodeId: destId,
      path,
      stateVersion: this.stateVersion,
    };
  }

  get eventLog(): readonly BoardEvent[] {
    return this.events;
  }

  get currentStateVersion(): number {
    return this.stateVersion;
  }

  private requirePosition(playerId: PlayerId): BoardNodeId {
    const nodeId = this.positions.get(playerId);
    if (!nodeId) {
      throw new GameError("INVALID_ACTION", `Player "${playerId}" is not placed on the board`);
    }
    return nodeId;
  }
}
