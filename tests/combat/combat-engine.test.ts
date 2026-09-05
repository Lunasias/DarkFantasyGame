import { describe, expect, it } from "vitest";
import { CombatEngine, Combatant, combatantFrom } from "@/game/combat";
import { GameError } from "@/game/engine";

function fighter(
  id: string,
  opts: { hp?: number; attack?: number; defense?: number } = {},
) {
  return new Combatant(id, {
    maxHealth: opts.hp ?? 100,
    health: opts.hp ?? 100,
    attack: opts.attack ?? 10,
    defense: opts.defense ?? 5,
  });
}

describe("CombatEngine", () => {
  it("starts a combat with the first combatant active", () => {
    const c = new CombatEngine([fighter("a"), fighter("b")], { now: () => 0 });
    expect(c.isActive).toBe(true);
    expect(c.activeCombatantId).toBe("a");
    expect(c.eventLog[0]?.type).toBe("COMBAT_STARTED");
  });

  it("rejects invalid combatants", () => {
    expect(() => new CombatEngine([fighter("a")], { now: () => 0 })).toThrow(GameError);
    expect(() =>
      new CombatEngine([fighter("a"), fighter("a")], { now: () => 0 }),
    ).toThrow(GameError);
    expect(() =>
      new CombatEngine([
        new Combatant("a", { maxHealth: 0, attack: 1, defense: 0 }),
        fighter("b"),
      ], { now: () => 0 }),
    ).toThrow(GameError);
  });

  it("applies deterministic damage = max(1, attack - defense)", () => {
    const c = new CombatEngine([fighter("a", { attack: 10, defense: 3 }), fighter("b", { defense: 4 })], { now: () => 0 });
    const result = c.attack("a", "b");
    expect(result.damage).toBe(10 - 4);
    expect(c.getCombatant("b")?.health).toBe(100 - 6);
    expect(result.stateVersion).toBe(1);
  });

  it("enforces a minimum of 1 damage", () => {
    const c = new CombatEngine([fighter("a", { attack: 2, defense: 0 }), fighter("b", { defense: 99 })], { now: () => 0 });
    const result = c.attack("a", "b");
    expect(result.damage).toBe(1);
  });

  it("rejects an attack from a non-active combatant", () => {
    const c = new CombatEngine([fighter("a"), fighter("b")], { now: () => 0 });
    expect(() => c.attack("b", "a")).toThrow(GameError);
  });

  it("rejects an invalid target", () => {
    const c = new CombatEngine([fighter("a"), fighter("b")], { now: () => 0 });
    expect(() => c.attack("a", "ghost")).toThrow(GameError);
    expect(() => c.attack("a", "a")).toThrow(GameError);
  });

  it("switches the active combatant after each turn", () => {
    const c = new CombatEngine([fighter("a", { attack: 5 }), fighter("b", { defense: 0 })], { now: () => 0 });
    c.attack("a", "b");
    expect(c.activeCombatantId).toBe("b");
    expect(c.currentCombatTurn).toBe(1);
  });

  it("declares victory and completes when a combatant is defeated", () => {
    const c = new CombatEngine([fighter("a", { attack: 200 }), fighter("b", { hp: 10 })], { now: () => 0 });
    const result = c.attack("a", "b");
    expect(result.defenderDefeated).toBe(true);
    expect(result.victory).toBe(true);
    expect(c.winner).toBe("a");
    expect(c.statusValue).toBe("completed");
    expect(c.eventLog.map((e) => e.type)).toEqual(
      expect.arrayContaining(["DAMAGE_DEALT", "COMBATANT_DEFEATED", "COMBAT_VICTORY", "COMBAT_COMPLETED"]),
    );
  });

  it("rejects actions after combat completes", () => {
    const c = new CombatEngine([fighter("a", { attack: 200 }), fighter("b", { hp: 10 })], { now: () => 0 });
    c.attack("a", "b");
    expect(() => c.attack("a", "b")).toThrow(GameError);
  });

  it("rejects attacking a dead target", () => {
    // attacker can't win without dying; simulate by a strong attacker so defender survives one hit? Use low defender hp.
    const c = new CombatEngine([fighter("a", { attack: 200 }), fighter("b", { hp: 10 }), fighter("c", { hp: 100, defense: 0 })], { now: () => 0 });
    // turn order a → b → c
    const r = c.attack("a", "b");
    expect(r.defenderDefeated).toBe(true);
    // c was defeated, victory if only one alive? alive = a, c → not victory. active advances to c.
    expect(c.activeCombatantId).toBe("c");
    expect(() => c.attack("a", "b")).toThrow(GameError); // b is dead
  });

  it("rejects a stale combat turn", () => {
    const c = new CombatEngine([fighter("a", { attack: 5 }), fighter("b", { defense: 0 })], { now: () => 0 });
    c.attack("a", "b"); // turn 1
    expect(() => c.attack("b", "a", { expectedCombatTurn: 0 })).toThrow(GameError);
  });

  it("is idempotent for a repeated identical attack", () => {
    const c = new CombatEngine([fighter("a", { attack: 5 }), fighter("b", { defense: 0 })], { now: () => 0 });
    const r1 = c.attack("a", "b", { idempotencyKey: "k1", expectedCombatTurn: 0 });
    const r2 = c.attack("a", "b", { idempotencyKey: "k1", expectedCombatTurn: 0 });
    expect(r2).toEqual(r1);
    expect(c.getCombatant("b")?.health).toBe(95);
  });

  it("produces deterministic results for the same state + action", () => {
    const build = () => new CombatEngine([fighter("a", { attack: 5, defense: 0 }), fighter("b", { defense: 2 })], { now: () => 0 });
    const a = build();
    const b = build();
    expect(a.attack("a", "b")).toEqual(b.attack("a", "b"));
  });

  it("adapts a Character's stats into a Combatant", () => {
    const c = combatantFrom("ch1", { maxHealth: 50, health: 50, attack: 7, defense: 3, speed: 4 });
    expect(c.maxHealth).toBe(50);
    expect(c.attack).toBe(7);
    expect(c.defense).toBe(3);
    expect(c.isAlive).toBe(true);
  });
});
