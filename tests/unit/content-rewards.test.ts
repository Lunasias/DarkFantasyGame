import { describe, expect, it } from "vitest";
import { createRng } from "@/game/engine";
import {
  questRewardKey,
  eventRewardKey,
  dungeonRewardKey,
  resolveRewardItems,
  objectiveMet,
  allObjectivesMet,
  getQuest,
  getWorldEvent,
  getTown,
  getDungeon,
} from "@/game/content";
import { validateReward, type RewardDefinition } from "@/game/rewards";

describe("content reward identities", () => {
  it("maps identical (character, content) to identical deterministic keys", () => {
    const q1 = questRewardKey("charA", "first_blood");
    const q2 = questRewardKey("charA", "first_blood");
    expect(q1).toBe(q2);
    expect(questRewardKey("charB", "first_blood")).not.toBe(q1);
    expect(questRewardKey("charA", "reach_the_village")).not.toBe(q1);
  });

  it("keeps quest / event / dungeon namespaces disjoint", () => {
    expect(questRewardKey("c", "x")).toBe("quest:x:c");
    expect(eventRewardKey("c", "x")).toBe("event:x:c");
    expect(dungeonRewardKey("c", "x")).toBe("dungeon:x:c");
    expect(questRewardKey("c", "x")).not.toBe(eventRewardKey("c", "x"));
    expect(eventRewardKey("c", "x")).not.toBe(dungeonRewardKey("c", "x"));
  });
});

describe("objective satisfaction", () => {
  it("is satisfied only when progress reaches the amount", () => {
    expect(objectiveMet(1, 1)).toBe(true);
    expect(objectiveMet(2, 1)).toBe(true);
    expect(objectiveMet(0, 1)).toBe(false);
  });

  it("requires every objective to be met", () => {
    const objectives = [{ id: "a", amount: 1 }, { id: "b", amount: 2 }];
    expect(allObjectivesMet({ a: 1, b: 2 }, objectives)).toBe(true);
    expect(allObjectivesMet({ a: 1, b: 1 }, objectives)).toBe(false);
    expect(allObjectivesMet({ a: 0, b: 0 }, objectives)).toBe(false);
    expect(allObjectivesMet({}, objectives)).toBe(false);
  });
});

describe("seeded drop resolution", () => {
  const reward: RewardDefinition = {
    id: "d",
    experience: 0,
    gold: 0,
    itemDrops: [
      { itemId: "always", quantity: 1, chance: 1 },
      { itemId: "never", quantity: 1, chance: 0 },
      { itemId: "half", quantity: 2, chance: 0.5 },
    ],
  };

  it("is deterministic for the same seed", () => {
    const a = resolveRewardItems(reward, createRng(7));
    const b = resolveRewardItems(reward, createRng(7));
    expect(a).toEqual(b);
  });

  it("always drops chance-1 and never drops chance-0", () => {
    const items = resolveRewardItems(reward, createRng(99));
    expect(items.find((i) => i.itemId === "always")?.quantity).toBe(1);
    expect(items.find((i) => i.itemId === "never")).toBeUndefined();
  });
});

describe("content definitions are loadable and rewards valid", () => {
  it("exposes compile-time registered content", () => {
    expect(getQuest("first_blood")).not.toBeNull();
    expect(getWorldEvent("cursed_shrine")).not.toBeNull();
    expect(getTown("ashenfall")).not.toBeNull();
    expect(getDungeon("crypt_of_ash")).not.toBeNull();
  });

  it("every registered content reward is valid", () => {
    validateReward(getQuest("first_blood")!.rewards);
    validateReward(getWorldEvent("cursed_shrine")!.reward);
    validateReward(getDungeon("crypt_of_ash")!.reward);
  });
});
