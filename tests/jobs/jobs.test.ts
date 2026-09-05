import { describe, expect, it } from "vitest";
import { createCharacter } from "@/game/engine";
import {
  allJobs,
  assignJob,
  combatantFor,
  getJob,
  hasJob,
  listJobIds,
  resolveEffectiveStats,
} from "@/game/jobs";

function character(overrides: Record<string, number> = {}) {
  return createCharacter({
    name: "Vex",
    archetype: "adventurer",
    stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8, ...overrides },
  });
}

describe("jobs", () => {
  it("defines the initial jobs", () => {
    expect(allJobs()).toHaveLength(5);
    expect([...listJobIds()].sort()).toEqual([
      "berserker",
      "cleric",
      "knight",
      "mage",
      "rogue",
    ]);
  });

  it("has unique job ids", () => {
    const ids = listJobIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retrieves jobs and rejects unknown ids", () => {
    expect(getJob("knight")?.name).toBe("Knight");
    expect(getJob("missing")).toBeNull();
    expect(hasJob("rogue")).toBe(true);
    expect(hasJob("missing")).toBe(false);
  });
});

describe("job assignment", () => {
  it("assigns a valid job and returns effective stats", () => {
    const char = character();
    const result = assignJob(char, "knight");
    expect(char.jobId).toBe("knight");
    expect(result.job.id).toBe("knight");
    expect(result.effectiveStats.maxHealth).toBe(130);
    expect(result.effectiveStats.defense).toBe(10);
  });

  it("rejects an invalid job", () => {
    expect(() => assignJob(character(), "warlock")).toThrow();
  });

  it("rejects a job change after the game has started", () => {
    const char = character();
    assignJob(char, "knight");
    expect(() => assignJob(char, "mage", { started: true })).toThrow();
  });

  it("emits a JOB_ASSIGNED event on assignment", () => {
    const events: unknown[] = [];
    assignJob(character(), "rogue", { emit: (e) => events.push(e) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "JOB_ASSIGNED", jobId: "rogue" });
  });
});

describe("stat resolution", () => {
  const base = { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 };

  it("computes deterministic effective stats", () => {
    const job = getJob("knight") as NonNullable<ReturnType<typeof getJob>>;
    expect(resolveEffectiveStats(base, job)).toEqual(resolveEffectiveStats(base, job));
  });

  it("applies different modifiers per job", () => {
    const knight = getJob("knight") as NonNullable<ReturnType<typeof getJob>>;
    const mage = getJob("mage") as NonNullable<ReturnType<typeof getJob>>;
    const k = resolveEffectiveStats(base, knight);
    const m = resolveEffectiveStats(base, mage);
    expect(k.maxHealth).toBeGreaterThan(m.maxHealth);
    expect(m.attack).toBeGreaterThan(k.attack);
  });
});

describe("combat integration", () => {
  it("uses authoritative effective job stats for a combatant", () => {
    const char = character();
    assignJob(char, "knight");
    const combatant = combatantFor(char);
    expect(combatant.maxHealth).toBe(130);
    expect(combatant.attack).toBe(12);
    expect(combatant.defense).toBe(10);
  });

  it("uses base stats when no job is assigned", () => {
    const char = character();
    const combatant = combatantFor(char);
    expect(combatant.maxHealth).toBe(100);
    expect(combatant.attack).toBe(10);
  });
});
