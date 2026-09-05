import { describe, expect, it } from "vitest";
import { createCharacter, createRng, type Rng } from "@/game/engine";
import { addItem, getQuantity } from "@/game/items";
import {
  LOOT_TABLES,
  RewardService,
  getLootTable,
  listLootTableIds,
  resolveLoot,
  validateItemDrop,
  validateLootTable,
  validateReward,
  type LootTableDefinition,
  type RewardDefinition,
} from "@/game/rewards";

function character() {
  return createCharacter({
    name: "Vex",
    archetype: "adventurer",
    stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
  });
}

function reward(overrides: Partial<RewardDefinition> = {}): RewardDefinition {
  return {
    id: "r1",
    experience: 100,
    gold: 50,
    itemDrops: [{ itemId: "grave_dust", quantity: 2, chance: 1 }],
    ...overrides,
  };
}

function rngAt(value: number): Rng {
  return { next: () => value, nextInt: (m: number) => Math.floor(value * m) };
}

describe("reward definitions", () => {
  it("accepts a valid reward", () => {
    expect(() => validateReward(reward())).not.toThrow();
  });

  it("rejects invalid EXP, gold, item, quantity, and chance", () => {
    expect(() => validateReward(reward({ experience: -1 }))).toThrow();
    expect(() => validateReward(reward({ gold: -1 }))).toThrow();
    expect(() => validateReward(reward({ itemDrops: [{ itemId: "missing", quantity: 1, chance: 1 }] }))).toThrow();
    expect(() => validateReward(reward({ itemDrops: [{ itemId: "grave_dust", quantity: 0, chance: 1 }] }))).toThrow();
    expect(() => validateReward(reward({ itemDrops: [{ itemId: "grave_dust", quantity: 1, chance: 2 }] }))).toThrow();
  });

  it("rejects an invalid item drop directly", () => {
    expect(() => validateItemDrop({ itemId: "missing", quantity: 1, chance: 0 })).toThrow();
  });
});

describe("loot", () => {
  it("defines loot tables with unique ids", () => {
    expect(LOOT_TABLES.length).toBeGreaterThanOrEqual(1);
    const ids = listLootTableIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(getLootTable("grave_barrow_loot")).toBeTruthy();
  });

  it("resolves loot deterministically under a seeded RNG", () => {
    const table = getLootTable("grave_barrow_loot") as LootTableDefinition;
    const a = resolveLoot(table, createRng(123));
    const b = resolveLoot(table, createRng(123));
    expect(a).toEqual(b);
  });

  it("can produce different outcomes for different RNG outcomes", () => {
    const table: LootTableDefinition = {
      id: "t",
      entries: [{ itemId: "grave_dust", minQuantity: 1, maxQuantity: 3, chance: 0.5 }],
    };
    expect(resolveLoot(table, rngAt(0.0)).length).toBe(1);
    expect(resolveLoot(table, rngAt(0.99)).length).toBe(0);
  });

  it("validates loot tables (invalid item / quantity / chance)", () => {
    const bad: LootTableDefinition = { id: "b", entries: [{ itemId: "nope", minQuantity: 1, maxQuantity: 1, chance: 0.5 }] };
    expect(() => validateLootTable(bad)).toThrow();
    expect(() => validateLootTable({ id: "b2", entries: [{ itemId: "grave_dust", minQuantity: 0, maxQuantity: 1, chance: 0.5 }] })).toThrow();
    expect(() => validateLootTable({ id: "b3", entries: [{ itemId: "grave_dust", minQuantity: 2, maxQuantity: 1, chance: 0.5 }] })).toThrow();
    expect(() => validateLootTable({ id: "b4", entries: [{ itemId: "grave_dust", minQuantity: 1, maxQuantity: 1, chance: 1.5 }] })).toThrow();
  });
});

describe("combat victory rewards", () => {
  it("grants EXP, gold, and items to the winner", () => {
    const service = new RewardService(createRng(7));
    const c = character();
    const result = service.grantVictoryReward(c, reward(), {
      combatId: "c1",
      winnerId: c.id,
    });
    expect(result.alreadyClaimed).toBe(false);
    expect(c.experience).toBe(100);
    expect(c.gold).toBe(150);
    expect(getQuantity(c, "grave_dust")).toBe(2);
    expect(service.claimedCount).toBe(1);
  });

  it("rejects a reward on defeat (won=false)", () => {
    const service = new RewardService();
    const c = character();
    expect(() =>
      service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id, won: false }),
    ).toThrow();
    expect(c.gold).toBe(100);
  });

  it("rejects a reward for a non-winner", () => {
    const service = new RewardService();
    const c = character();
    expect(() =>
      service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: "someone-else" }),
    ).toThrow();
  });

  it("grants a completed combat only once (idempotent)", () => {
    const service = new RewardService(createRng(7));
    const c = character();
    const first = service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id });
    const second = service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id });
    expect(second.alreadyClaimed).toBe(true);
    expect(second).toMatchObject({
      rewardId: first.rewardId,
      experienceGranted: first.experienceGranted,
      goldGranted: first.goldGranted,
      itemsGranted: first.itemsGranted,
    });
    expect(c.experience).toBe(100); // not doubled
    expect(c.gold).toBe(150);
    expect(getQuantity(c, "grave_dust")).toBe(2);
  });
});

describe("idempotency + atomicity", () => {
  it("fails atomically when equipment loot would be duplicated", () => {
    const service = new RewardService();
    const c = character();
    addItem(c, "iron_longsword", 1); // already owns the weapon
    const evil = reward({ itemDrops: [{ itemId: "iron_longsword", quantity: 1, chance: 1 }] });
    expect(() =>
      service.grantVictoryReward(c, evil, { combatId: "c1", winnerId: c.id }),
    ).toThrow();
    expect(c.experience).toBe(0); // no partial EXP
    expect(c.gold).toBe(100); // no partial gold
  });

  it("does not emit reward events on an idempotent retry", () => {
    const service = new RewardService(createRng(7));
    const events: unknown[] = [];
    const emit = (e: unknown) => events.push(e);
    const c = character();
    service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id, emit });
    events.length = 0; // clear
    service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id, emit });
    expect(events).toHaveLength(0);
    expect(service.claimedCount).toBe(1);
  });
});

describe("events", () => {
  it("emits reward events in a deterministic order", () => {
    const service = new RewardService(createRng(7));
    const events: unknown[] = [];
    const emit = (e: unknown) => events.push(e);
    const c = character();
    service.grantVictoryReward(c, reward(), { combatId: "c1", winnerId: c.id, emit });
    const types = events.map((e) => (e as { type: string }).type);
    expect(types).toEqual([
      "LOOT_RESOLVED",
      "EXP_REWARDED",
      "GOLD_REWARDED",
      "ITEM_REWARDED",
      "REWARD_GRANTED",
    ]);
    expect(events[events.length - 1]).toMatchObject({
      type: "REWARD_GRANTED",
      data: { experienceGranted: 100, goldGranted: 50 },
    });
  });
});

describe("progression/economy integration", () => {
  it("levels up a character through the existing progression system", () => {
    const service = new RewardService(createRng(7));
    const c = character();
    const big = reward({ experience: 300 }); // expForLevel(3) = 300
    const result = service.grantVictoryReward(c, big, { combatId: "c1", winnerId: c.id });
    expect(result.experienceGranted).toBe(300);
    expect(c.level).toBe(3);
    expect(c.experience).toBe(300);
  });
});
