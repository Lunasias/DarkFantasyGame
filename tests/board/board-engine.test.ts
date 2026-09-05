import { describe, expect, it } from "vitest";
import { Board, BoardEngine, BoardNode } from "@/game/board";
import { GameError } from "@/game/engine";

function makeBoard() {
  const board = new Board();
  board.addNode(new BoardNode({ id: "A", label: "Start", kind: "start" }));
  board.addNode(new BoardNode({ id: "B", kind: "normal" }));
  board.addNode(new BoardNode({ id: "C", kind: "town" }));
  board.addNode(new BoardNode({ id: "D", kind: "battle" }));
  board.connect("A", "B");
  board.connect("B", "C");
  board.connect("C", "D");
  return board;
}

describe("Board graph", () => {
  it("creates a board and identifies the start node", () => {
    const board = makeBoard();
    expect(board.startNode?.id).toBe("A");
    expect(board.allNodes).toHaveLength(4);
  });

  it("keeps node ids unique", () => {
    const board = new Board();
    board.addNode(new BoardNode({ id: "A" }));
    board.addNode(new BoardNode({ id: "A" }));
    expect(board.allNodes).toHaveLength(1);
  });

  it("registers valid bidirectional connections", () => {
    const board = makeBoard();
    expect(board.neighbors("A")).toContain("B");
    expect(board.neighbors("B")).toContain("A");
  });

  it("rejects a connection to a missing node", () => {
    const board = makeBoard();
    expect(() => board.connect("A", "GHOST")).toThrow(GameError);
  });

  it("validates the board", () => {
    expect(new Board().validate()).toContain("board has no nodes");
    const noStart = new Board();
    noStart.addNode(new BoardNode({ id: "A", kind: "normal" }));
    expect(noStart.validate()).toContain("board has no start node");
  });
});

describe("BoardEngine movement", () => {
  it("places players and reads their positions", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    engine.place("p2", "C");
    expect(engine.getPosition("p1")).toBe("A");
    expect(engine.getPosition("p2")).toBe("C");
  });

  it("computes deterministic reachable nodes", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    expect(engine.reachable("p1", 1)).toEqual(expect.arrayContaining(["B"]));
    expect(engine.reachable("p1", 2)).toEqual(expect.arrayContaining(["B", "C"]));
    expect(engine.reachable("p1", 1)).not.toContain("C");
  });

  it("moves a player along a valid path and emits an event", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    const result = engine.move("p1", "C", { maxSteps: 2 });
    expect(result.toNodeId).toBe("C");
    expect(result.path).toEqual(["A", "B", "C"]);
    expect(result.stateVersion).toBe(1);
    expect(engine.getPosition("p1")).toBe("C");
    expect(engine.eventLog).toHaveLength(1);
    expect(engine.eventLog[0]?.type).toBe("PLAYER_POSITION_CHANGED");
    expect(engine.eventLog[0]?.fromNodeId).toBe("A");
    expect(engine.eventLog[0]?.toNodeId).toBe("C");
  });

  it("rejects movement that is out of reach", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    expect(() => engine.move("p1", "D", { maxSteps: 2 })).toThrow(GameError);
    expect(engine.getPosition("p1")).toBe("A");
    expect(engine.eventLog).toHaveLength(0);
  });

  it("rejects movement to or from an invalid node id", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    expect(() => engine.move("p1", "GHOST", { maxSteps: 2 })).toThrow(GameError);
    expect(() => engine.place("p2", "GHOST")).toThrow(GameError);
    expect(() => engine.move("nobody", "B", { maxSteps: 1 })).toThrow(GameError);
  });

  it("supports multiple players independently", () => {
    const engine = new BoardEngine(makeBoard());
    engine.place("p1", "A");
    engine.place("p2", "C");
    engine.move("p1", "B", { maxSteps: 1 });
    engine.move("p2", "D", { maxSteps: 1 });
    expect(engine.getPosition("p1")).toBe("B");
    expect(engine.getPosition("p2")).toBe("D");
    expect(engine.eventLog).toHaveLength(2);
  });

  it("produces deterministic movement results", () => {
    const a = new BoardEngine(makeBoard());
    const b = new BoardEngine(makeBoard());
    a.place("p1", "A");
    b.place("p1", "A");
    expect(a.move("p1", "C", { maxSteps: 2 })).toEqual(
      b.move("p1", "C", { maxSteps: 2 }),
    );
  });
});
