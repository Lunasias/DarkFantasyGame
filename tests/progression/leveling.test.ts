import { describe, expect, it } from "vitest";
import { createCharacter } from "@/game/engine";
import { assignJob, combatantFor } from "@/game/jobs";
import {
  MAX_LEVEL,
  addExperience,
  expForLevel,
  expToNextLevel,
  levelForExp,
} from "@/game/progression";

function character() {
  return createCharacter({
    name: "Vex",
    archetype: "adventurer",
    stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
  });
}

describe("character progression", () => {
  it("starts at level 1 with 0 EXP", () => {
    const c = character();
    expect(c.level).toBe(1);
    expect(c.experience).toBe(0);
  });

  it("computes deterministic EXP thresholds", () => {
    expect(expForLevel(1)).toBe(0);
    expect(expForLevel(2)).toBe(100);
    expect(expToNextLevel(1)).toBe(100);
    expect(expToNextLevel(2)).toBe(200);
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(100)).toBe(2);
    expect(levelForExp(9999999)).toBe(MAX_LEVEL);
  });

  it("gains EXP and reaches the next level at the boundary", () => {
    const c = character();
    const r = addExperience(c, 100); // exactly level-2 boundary
    expect(c.experience).toBe(100);
    expect(c.level).toBe(2);
    expect(r.levelsGained).toBe(1);
  });

  it("supports zero EXP as a no-op", () => {
    const c = character();
    const r = addExperience(c, 0);
    expect(r.levelsGained).toBe(0);
    expect(c.level).toBe(1);
    expect(c.experience).toBe(0);
  });

  it("rejects negative or unsafe EXP", () => {
    const c = character();
    expect(() => addExperience(c, -5)).toThrow();
    expect(() => addExperience(c, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => addExperience(c, 1.5)).toThrow();
  });

  it("gains multiple levels from a large amount", () => {
    const c = character();
    const r = addExperience(c, 600); // L4 (expForLevel(4) = 600)
    expect(levels(c)).toBe(4);
    expect(r.levelsGained).toBe(3);
    expect(c.level).toBe(4);
  });

  it("clamps at the maximum level", () => {
    const c = character();
    addExperience(c, Number.MAX_SAFE_INTEGER);
    expect(c.level).toBe(MAX_LEVEL);
  });
});

describe("level-derived stats", () => {
  it("scales maxHealth, attack, and defense with level", () => {
    const c = character();
    addExperience(c, 700); // level 4 (expForLevel(4)=600)
    expect(c.level).toBe(4);
    const stats = combatantFor(c);
    expect(stats.maxHealth).toBe(100 + 3 * 8); // +24
    expect(stats.attack).toBe(10 + 3 * 2); // +6
    expect(stats.defense).toBe(5 + 3 * 1); // +3
  });

  it("stacks job modifiers with level bonuses", () => {
    const c = character();
    assignJob(c, "knight"); // +30 maxHealth, +2 attack, +5 defense
    addExperience(c, 300); // level 3
    const stats = combatantFor(c);
    expect(stats.maxHealth).toBe(100 + 30 + 2 * 8);
    expect(stats.attack).toBe(10 + 2 + 2 * 2);
    expect(stats.defense).toBe(5 + 5 + 2 * 1);
  });

  it("does not reduce current health when maxHealth grows", () => {
    const c = character();
    c.takeDamage(20); // current health 80
    addExperience(c, 300); // level 3
    const stats = combatantFor(c);
    expect(stats.maxHealth).toBe(100 + 2 * 8);
    expect(stats.health).toBe(80); // unchanged, clamped to new max
    expect(stats.health).toBeLessThanOrEqual(stats.maxHealth);
  });
});

describe("events", () => {
  it("emits EXP_GAINED and LEVEL_UP on progression", () => {
    const events: unknown[] = [];
    const c = character();
    addExperience(c, 150, { emit: (e) => events.push(e) });
    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "EXP_GAINED",
      "LEVEL_UP",
    ]);
    expect(events[0]).toMatchObject({ type: "EXP_GAINED" });
    expect(events[1]).toMatchObject({ type: "LEVEL_UP" });
  });

  it("emits only EXP_GAINED when no level-up occurs", () => {
    const events: unknown[] = [];
    addExperience(character(), 10, { emit: (e) => events.push(e) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "EXP_GAINED" });
  });
});

function levels(c: { level: number }): number {
  return c.level;
}
