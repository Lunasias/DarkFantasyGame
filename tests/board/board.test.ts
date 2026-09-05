import { describe, expect, it } from "vitest";
import { Board, BoardNode } from "@/game/board";
import { GameError } from "@/game/engine";

describe("Board", () => {
  it("adds nodes and identifies the start node", () => {
    const board = new Board();
    const start = new BoardNode({ label: "A", kind: "start" });
    const normal = new BoardNode({ label: "N" });
    board.addNode(start);
    board.addNode(normal);
    expect(board.allNodes).toHaveLength(2);
    expect(board.startNode?.id).toBe(start.id);
  });

  it("connects nodes bidirectionally", () => {
    const board = new Board();
    const a = new BoardNode({ label: "A" });
    const b = new BoardNode({ label: "N" });
    board.addNode(a);
    board.addNode(b);
    board.connect(a.id, b.id);
    expect(a.isAdjacentTo(b.id)).toBe(true);
    expect(b.isAdjacentTo(a.id)).toBe(true);
  });

  it("throws a domain error for a missing node", () => {
    const board = new Board();
    expect(() => board.requireNode("missing")).toThrow(GameError);
  });
});
