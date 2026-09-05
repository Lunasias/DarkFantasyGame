import { describe, expect, it } from "vitest";
import { Board, BoardEngine, BoardNode } from "@/game/board";
import {
  GameError,
  MovementEngine,
  TurnEngine,
  createRng,
  type Rng,
} from "@/game/engine";

/** Rng whose nextInt always returns a fixed value → dice = value + 1. */
function fixedRng(diceMinusOne: number): Rng {
  return { next: () => 0, nextInt: () => diceMinusOne };
}

function linearBoard() {
  const board = new Board();
  board.addNode(new BoardNode({ id: "A", kind: "start" }));
  board.addNode(new BoardNode({ id: "B" }));
  board.addNode(new BoardNode({ id: "C" }));
  board.addNode(new BoardNode({ id: "D" }));
  board.connect("A", "B");
  board.connect("B", "C");
  board.connect("C", "D");
  return board;
}

function setup(players = ["a", "b", "c"], opts: { rng?: Rng; diceSides?: number } = {}) {
  const board = linearBoard();
  const boardEngine = new BoardEngine(board);
  boardEngine.place("a", "A");
  boardEngine.place("b", "C");
  boardEngine.place("c", "B");
  const turnEngine = new TurnEngine("s1", players, { now: () => 0, rng: createRng(42) });
  const movement = new MovementEngine(turnEngine, boardEngine, {
    rng: opts.rng ?? createRng(42),
    diceSides: opts.diceSides ?? 6,
  });
  movement.start();
  return { boardEngine, turnEngine, movement };
}

describe("MovementEngine dice", () => {
  it("produces a six-sided result in 1..6", () => {
    const { movement } = setup(["a", "b"], { diceSides: 6 });
    const dice = movement.rollDice();
    expect(dice).toBeGreaterThanOrEqual(1);
    expect(dice).toBeLessThanOrEqual(6);
    expect(movement.diceResult).toBe(dice);
  });

  it("is deterministic under a seed", () => {
    const a = setup(["a", "b"], { diceSides: 6 });
    const b = setup(["a", "b"], { diceSides: 6 });
    expect(a.movement.rollDice()).toBe(b.movement.rollDice());
  });

  it("rejects a roll from the non-active player", () => {
    const { movement } = setup();
    expect(() => movement.rollDice("b")).toThrow(GameError);
  });

  it("rejects a roll before the turn engine starts", () => {
    const boardEngine = new BoardEngine(linearBoard());
    boardEngine.place("a", "A");
    const turnEngine = new TurnEngine("s1", ["a", "b"], { now: () => 0 });
    const movement = new MovementEngine(turnEngine, boardEngine, {
      rng: fixedRng(0),
    });
    expect(() => movement.rollDice()).toThrow(GameError);
  });

  it("rejects a duplicate roll in the same turn", () => {
    const { movement } = setup();
    movement.rollDice();
    expect(() => movement.rollDice()).toThrow(GameError);
  });
});

describe("MovementEngine movement", () => {
  it("rejects movement before rolling", () => {
    const { movement } = setup();
    expect(() => movement.move("B")).toThrow(GameError);
  });

  it("moves to a valid reachable destination (dice = 1)", () => {
    const { boardEngine, movement } = setup(["a", "b"], { rng: fixedRng(0) }); // dice = 1
    movement.rollDice();
    const result = movement.move("B");
    expect(result.toNodeId).toBe("B");
    expect(result.steps).toBe(1);
    expect(result.stateVersion).toBe(2);
    expect(boardEngine.getPosition("a")).toBe("B");
    expect(movement.currentPlayer).toBe("b"); // advanced
  });

  it("rejects a destination beyond the rolled distance", () => {
    const { boardEngine, movement } = setup(["a", "b"], { rng: fixedRng(0) }); // dice = 1
    movement.rollDice();
    expect(() => movement.move("C")).toThrow(GameError); // distance 2
    expect(boardEngine.getPosition("a")).toBe("A");
  });

  it("rejects an invalid node id as destination", () => {
    const { movement } = setup(["a", "b"], { rng: fixedRng(0) });
    movement.rollDice();
    expect(() => movement.move("GHOST")).toThrow(GameError);
  });

  it("rejects a duplicate movement in one turn", () => {
    const { boardEngine, movement } = setup(["a", "b"], { rng: fixedRng(0) });
    movement.rollDice();
    movement.move("B");
    // after move the turn advanced; the previous player can't act again
    expect(() => movement.move("B", "a")).toThrow(GameError);
    expect(boardEngine.getPosition("a")).toBe("B");
  });

  it("exposes only authorized reachable destinations", () => {
    const { movement } = setup(["a", "b"], { rng: fixedRng(0) }); // dice = 1
    movement.rollDice();
    expect(movement.reachableDestinations()).toEqual(["B"]);
  });
});

describe("MovementEngine turn flow", () => {
  it("moves along a branching path with multiple valid destinations", () => {
    const board = new Board();
    board.addNode(new BoardNode({ id: "A", kind: "start" }));
    board.addNode(new BoardNode({ id: "B" }));
    board.addNode(new BoardNode({ id: "C" }));
    board.addNode(new BoardNode({ id: "E" }));
    board.connect("A", "B");
    board.connect("B", "C");
    board.connect("B", "E"); // branch
    const boardEngine = new BoardEngine(board);
    boardEngine.place("a", "A");
    const turnEngine = new TurnEngine("s1", ["a", "b"], { now: () => 0 });
    const movement = new MovementEngine(turnEngine, boardEngine, {
      rng: fixedRng(1), // dice = 2
    });
    movement.start();
    movement.rollDice();
    const destinations = movement.reachableDestinations();
    expect(destinations.sort()).toEqual(["B", "C", "E"]);
    const result = movement.move("E");
    expect(result.toNodeId).toBe("E");
    expect(result.steps).toBe(2);
  });

  it("follows the expected event ordering", () => {
    const { movement } = setup(["a", "b"], { rng: fixedRng(0) });
    movement.rollDice();
    movement.move("B");
    const types = movement.eventLog.map((ev) => ev.type);
    expect(types).toEqual([
      "ROLL_REQUIRED",
      "DICE_ROLLED",
      "MOVEMENT_REQUIRED",
      "PLAYER_MOVED",
      "ROLL_REQUIRED",
    ]);
  });

  it("advances stateVersion across roll and move", () => {
    const { movement } = setup(["a", "b"], { rng: fixedRng(0) });
    expect(movement.currentStateVersion).toBe(0);
    movement.rollDice();
    expect(movement.currentStateVersion).toBe(1);
    movement.move("B");
    expect(movement.currentStateVersion).toBe(2);
  });

  it("advances to the next player after a complete turn", () => {
    const { movement } = setup(["a", "b", "c"], { rng: fixedRng(0) });
    expect(movement.currentPlayer).toBe("a");
    movement.rollDice();
    movement.move("B");
    expect(movement.currentPlayer).toBe("b");
  });
});
