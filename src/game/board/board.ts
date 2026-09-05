import { createId } from "../engine/id";
import { boardNodeNotFound } from "../engine/errors";
import type { BoardNodeId, EntityId } from "../engine/types";
import { BoardNode } from "./node";

/**
 * A `Board` is a graph of {@link BoardNode}s. It intentionally models the board
 * as a graph (nodes + adjacency) rather than a tile grid, so the same data can
 * drive a hex, square, or free-form 3D layout without changing engine rules.
 *
 * It is a pure, framework-independent graph. Authoritative player positioning
 * and movement live in {@link BoardEngine} (the domain authority); this class
 * only provides the graph + validation + deterministic path helpers.
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

  /** The ids directly adjacent to a node. */
  neighbors(id: BoardNodeId): readonly BoardNodeId[] {
    return this.requireNode(id).neighborIds;
  }

  get allNodes(): readonly BoardNode[] {
    return [...this.nodes.values()];
  }

  get startNode(): BoardNode | null {
    return this.startNodeId ? this.requireNode(this.startNodeId) : null;
  }

  /** Validate the graph: at least one node, unique ids, a start node, and no
   *  edges to a non-existent node. Returns a list of human-readable issues. */
  validate(): string[] {
    const issues: string[] = [];
    if (this.nodes.size === 0) {
      issues.push("board has no nodes");
    }
    if (this.startNodeId === null) {
      issues.push("board has no start node");
    }
    for (const node of this.allNodes) {
      for (const neighborId of node.neighborIds) {
        if (!this.nodes.has(neighborId)) {
          issues.push(`node "${node.id}" references missing node "${neighborId}"`);
        }
      }
    }
    return issues;
  }

  /** Throw if the board is invalid. */
  assertValid(): void {
    const issues = this.validate();
    if (issues.length > 0) {
      throw new Error(`Invalid board: ${issues.join("; ")}`);
    }
  }

  /**
   * Nodes reachable from `fromId` within `maxSteps` hops along edges, excluding
   * the origin. Deterministic (BFS discovery order). `maxSteps` must be ≥ 1.
   */
  reachableWithin(fromId: BoardNodeId, maxSteps: number): BoardNodeId[] {
    if (maxSteps < 1) return [];
    const origin = this.requireNode(fromId);
    const seen = new Set<BoardNodeId>([origin.id]);
    let frontier: BoardNodeId[] = [origin.id];
    const result: BoardNodeId[] = [];
    for (let step = 0; step < maxSteps; step++) {
      const next: BoardNodeId[] = [];
      for (const nodeId of frontier) {
        for (const neighborId of this.requireNode(nodeId).neighborIds) {
          if (!seen.has(neighborId)) {
            seen.add(neighborId);
            result.push(neighborId);
            next.push(neighborId);
          }
        }
      }
      frontier = next;
    }
    return result;
  }

  /** Shortest path (inclusive of both endpoints) between two nodes, or null. */
  shortestPath(fromId: BoardNodeId, toId: BoardNodeId): BoardNodeId[] | null {
    if (fromId === toId) return [fromId];
    const start = this.requireNode(fromId);
    this.requireNode(toId);
    const queue: BoardNodeId[] = [start.id];
    const prev = new Map<BoardNodeId, BoardNodeId>();
    const seen = new Set<BoardNodeId>([start.id]);
    while (queue.length > 0) {
      const current = queue.shift() as BoardNodeId;
      for (const neighborId of this.requireNode(current).neighborIds) {
        if (seen.has(neighborId)) continue;
        seen.add(neighborId);
        prev.set(neighborId, current);
        if (neighborId === toId) {
          return this.reconstruct(prev, fromId, toId);
        }
        queue.push(neighborId);
      }
    }
    return null;
  }

  /** Shortest path between two nodes if it fits within `maxSteps`; else null. */
  shortestPathWithin(
    fromId: BoardNodeId,
    toId: BoardNodeId,
    maxSteps: number,
  ): BoardNodeId[] | null {
    const path = this.shortestPath(fromId, toId);
    if (!path) return null;
    if (path.length - 1 > maxSteps) return null; // path edges = length-1
    return path;
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

  private reconstruct(
    prev: Map<BoardNodeId, BoardNodeId>,
    fromId: BoardNodeId,
    toId: BoardNodeId,
  ): BoardNodeId[] {
    const path: BoardNodeId[] = [toId];
    let current = toId;
    while (current !== fromId) {
      current = prev.get(current) as BoardNodeId;
      path.unshift(current);
    }
    return path;
  }
}
