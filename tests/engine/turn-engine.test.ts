import { describe, expect, it } from "vitest";
import { GameError, TurnEngine, createRng } from "@/game/engine";

function engine(players: string[] = ["a", "b", "c"]) {
  return new TurnEngine("s1", players, { now: () => 0, rng: createRng(42) });
}

describe("TurnEngine", () => {
  it("starts the first turn for the first seated player", () => {
    const e = engine();
    e.start();
    expect(e.statusValue).toBe("active");
    expect(e.isActive).toBe(true);
    expect(e.currentTurn).toBe(1);
    expect(e.currentPlayer).toBe("a");
    expect(e.phaseName).toBe("player_action_required");
    expect(e.eventLog[0]?.type).toBe("TURN_STARTED");
    expect(e.eventLog[0]?.turn).toBe(1);
  });

  it("resolves a valid action and advances the turn", () => {
    const e = engine();
    e.start();
    const res = e.submitAction({ type: "end_turn", playerId: "a" });
    expect(res.turn).toBe(1);
    expect(res.playerId).toBe("a");
    expect(res.stateVersion).toBe(1);
    expect(e.currentStateVersion).toBe(1);
    expect(e.currentTurn).toBe(2);
    expect(e.currentPlayer).toBe("b");
  });

  it("rejects actions from the non-active player", () => {
    const e = engine();
    e.start();
    expect(() => e.submitAction({ type: "end_turn", playerId: "b" })).toThrow(
      GameError,
    );
    expect(e.currentPlayer).toBe("a");
    expect(e.eventLog.some((ev) => ev.type === "ACTION_REJECTED")).toBe(true);
  });

  it("rejects unknown action types", () => {
    const e = engine();
    e.start();
    expect(() =>
      e.submitAction({ type: "teleport", playerId: "a" } as never),
    ).toThrow(GameError);
    expect(e.currentTurn).toBe(1);
    expect(e.eventLog.some((ev) => ev.type === "ACTION_REJECTED")).toBe(true);
  });

  it("rejects players who are not in the session", () => {
    const e = engine();
    e.start();
    expect(() =>
      e.submitAction({ type: "end_turn", playerId: "zzz" }),
    ).toThrow(GameError);
  });

  it("rejects a stale action for an already-advanced turn", () => {
    const e = engine();
    e.start();
    e.submitAction({ type: "end_turn", playerId: "a" }); // advances to turn 2
    // A different action claiming an old turn number must be rejected as stale.
    expect(() =>
      e.submitAction({ type: "move", playerId: "a" }, { expectedTurn: 1 }),
    ).toThrow(GameError);
  });

  it("is idempotent for a repeated identical action", () => {
    const e = engine();
    e.start();
    const r1 = e.submitAction(
      { type: "end_turn", playerId: "a", payload: { x: 1 } },
      { idempotencyKey: "k1", expectedTurn: 1 },
    );
    const r2 = e.submitAction(
      { type: "end_turn", playerId: "a", payload: { x: 1 } },
      { idempotencyKey: "k1", expectedTurn: 1 },
    );
    expect(r2).toEqual(r1);
    // no double advance / no duplicate resolution
    expect(e.currentTurn).toBe(2);
    expect(e.eventLog.filter((ev) => ev.type === "ACTION_ACCEPTED")).toHaveLength(1);
  });

  it("rejects a different action for an already-resolved turn", () => {
    const e = engine();
    e.start();
    e.submitAction({ type: "end_turn", playerId: "a" }, { idempotencyKey: "k1" });
    expect(() =>
      e.submitAction({ type: "move", playerId: "a" }, { expectedTurn: 1, idempotencyKey: "k2" }),
    ).toThrow(GameError);
  });

  it("advances through players in order", () => {
    const e = engine();
    e.start();
    expect(e.currentPlayer).toBe("a");
    e.submitAction({ type: "end_turn", playerId: "a" });
    expect(e.currentPlayer).toBe("b");
    e.submitAction({ type: "end_turn", playerId: "b" });
    expect(e.currentPlayer).toBe("c");
    e.submitAction({ type: "end_turn", playerId: "c" });
    expect(e.currentPlayer).toBe("a"); // wraps around
  });

  it("increments state version once per resolved turn", () => {
    const e = engine();
    e.start();
    expect(e.currentStateVersion).toBe(0);
    const r1 = e.submitAction({ type: "end_turn", playerId: "a" });
    expect(r1.stateVersion).toBe(1);
    const r2 = e.submitAction({ type: "end_turn", playerId: "b" });
    expect(r2.stateVersion).toBe(2);
    expect(e.currentStateVersion).toBe(2);
  });

  it("emits lifecycle events in order with monotonic sequences", () => {
    const e = engine();
    e.start();
    e.submitAction({ type: "end_turn", playerId: "a" });
    const types = e.eventLog.map((ev) => ev.type);
    expect(types).toEqual([
      "TURN_STARTED",
      "ACTION_ACCEPTED",
      "ACTION_RESOLVED",
      "TURN_COMPLETED",
      "TURN_STARTED",
    ]);
    const seqs = e.eventLog.map((ev) => ev.sequence);
    expect(seqs).toEqual([1, 2, 3, 4, 5].slice(0, seqs.length));
  });

  it("produces deterministic results for the same input + state", () => {
    const runs = [engine(), engine()];
    const results = runs.map((e) => {
      e.start();
      return e.submitAction({ type: "end_turn", playerId: "a" }).result;
    });
    expect(results[0]).toEqual(results[1]);
  });

  it("rejects actions after the session finishes", () => {
    const e = engine();
    e.start();
    e.finish();
    expect(e.statusValue).toBe("finished");
    expect(() => e.submitAction({ type: "end_turn", playerId: "a" })).toThrow(
      GameError,
    );
    expect(() => e.finish()).toThrow(GameError);
  });

  it("runs framework-independently in Node (no React/Next/Three)", () => {
    const e = engine();
    e.start();
    expect(e.currentTurn).toBe(1);
  });
});

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    expect(a.next()).toBe(b.next());
    expect(a.nextInt(100)).toBe(b.nextInt(100));
  });
});
