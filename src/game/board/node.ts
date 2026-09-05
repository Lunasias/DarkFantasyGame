import { createId } from "../engine/id";
import type { BoardNodeId } from "../engine/types";

/**
 * The category of a board node. Phase 0 only needs the concept; specific rules
 * for each kind arrive with the Board phase.
 */
export type BoardNodeKind =
  | "start"
  | "normal"
  | "town"
  | "dungeon"
  | "event"
  | "boss";

export interface BoardNodePosition {
  readonly x: number;
  readonly y: number;
}

export interface BoardNodeOptions {
  id?: BoardNodeId;
  label?: string;
  kind?: BoardNodeKind;
  position?: BoardNodePosition;
}

/**
 * A single square on the board. It exposes an adjacency list rather than a
 * physical layout, which keeps the engine independent of the 3D renderer: R3F
 * maps each node's `position` to a mesh, but never dictates rules.
 */
export class BoardNode {
  readonly id: BoardNodeId;
  label: string;
  kind: BoardNodeKind;
  position: BoardNodePosition;
  private readonly adjacent = new Set<BoardNodeId>();

  constructor(options: BoardNodeOptions = {}) {
    this.id = options.id ?? createId();
    this.label = options.label ?? "";
    this.kind = options.kind ?? "normal";
    this.position = options.position ?? { x: 0, y: 0 };
  }

  /** An ordered, immutable snapshot of the neighbouring node ids. */
  get neighborIds(): readonly BoardNodeId[] {
    return [...this.adjacent];
  }

  /** Convenient boolean for rendering/enabling adjacency later. */
  isAdjacentTo(other: BoardNodeId): boolean {
    return this.adjacent.has(other);
  }

  /** Internal edge registration, called by {@link Board}. */
  connect(other: BoardNodeId): void {
    this.adjacent.add(other);
  }
}
