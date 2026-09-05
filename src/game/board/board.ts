import { createId } from "../engine/id";
import { boardNodeNotFound } from "../engine/errors";
import type { BoardNodeId, EntityId } from "../engine/types";
import { BoardNode } from "./node";

/**
 * A `Board` is a graph of {@link BoardNode}s. It intentionally models the board
 * as a graph (nodes + adjacency) rather than a tile grid, so the same data can
 * drive a hex, square, or free-form 3D layout without changing engine rules.
 */
export class Board {
  readonly id: EntityId;
  private readonly nodes = new Map<BoardNodeId, BoardNode>();
  private startNodeId: BoardNodeId | null = null;

  constructor(id: EntityId = createId()) {
    this.id = id;
  }

  /** Add (or overwrite) a node and return it for chained configuration. */
  addNode(node: BoardNode): BoardNode {
    this.nodes.set(node.id, node);
    if (node.kind === "start" && this.startNodeId === null) {
      this.startNodeId = node.id;
    }
    return node;
  }

  /** Return a node, or `undefined` if it does not exist. */
  getNode(id: BoardNodeId): BoardNode | undefined {
    return this.nodes.get(id);
  }

  /** Return a node or throw a domain error — useful for action resolution. */
  requireNode(id: BoardNodeId): BoardNode {
    const node = this.nodes.get(id);
    if (!node) {
      throw boardNodeNotFound(id);
    }
    return node;
  }

  /** Register a bidirectional edge between two existing nodes. */
  connect(a: BoardNodeId, b: BoardNodeId): void {
    this.requireNode(a).connect(b);
    this.requireNode(b).connect(a);
  }

  get allNodes(): readonly BoardNode[] {
    return [...this.nodes.values()];
  }

  get startNode(): BoardNode | null {
    return this.startNodeId ? this.requireNode(this.startNodeId) : null;
  }

  /** A deterministic snapshot of the board, safe to serialize over the wire. */
  toSnapshot(): BoardNode[] {
    return this.allNodes.map(
      (node) =>
        new BoardNode({
          id: node.id,
          label: node.label,
          kind: node.kind,
          position: node.position,
        }),
    );
  }
}
