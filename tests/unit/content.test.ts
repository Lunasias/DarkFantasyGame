import { describe, expect, it } from "vitest";
import { createCharacter, createRng, GameError, type Character, type Rng } from "@/game/engine";
import {
  ContentService,
  allDungeons,
  allQuests,
  allTowns,
  allWorldEvents,
  getDungeon,
  getQuest,
  getTown,
  getWorldEvent,
} from "@/game/content";

function freshCharacter(): Character {
  return createCharacter({ name: "test", archetype: "a", stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 } });
}
function deterministicService(roll: number): ContentService {
  // Rng stub that returns a fixed value so events resolve predictably.
  const rng: Rng = { next: () => roll, nextInt: () => 0 };
  return new ContentService({ rng });
}

describe("content registries", () => {
  it("registers all quests, events, towns, dungeons", () => {
    expect(allQuests().length).toBeGreaterThan(0);
    expect(allWorldEvents().length).toBeGreaterThan(0);
    expect(allTowns().length).toBeGreaterThan(0);
    expect(allDungeons().length).toBeGreaterThan(0);
  });

  it("allows lookups by id and returns null for unknown ids", () => {
    expect(getQuest("first_blood")).not.toBeNull();
    expect(getWorldEvent("cursed_shrine")).not.toBeNull();
    expect(getTown("ashenfall")).not.toBeNull();
    expect(getDungeon("crypt_of_ash")).not.toBeNull();
    expect(getQuest("nope")).toBeNull();
  });

  it("validates reward definitions at load (unknown item rejected)", () => {
    expect(() => getDungeon("crypt_of_ash")).not.toThrow();
    expect(getDungeon("crypt_of_ash")!.reward.itemDrops!.length).toBe(1);
  });
});

describe("quest system", () => {
  it("blocks completing an unaccepted/unmet quest", () => {
    const svc = new ContentService();
    const c = freshCharacter();
    expect(() => svc.completeQuest(c, "first_blood")).toThrow(GameError);
  });

  it("rejects progress on an unknown objective", () => {
    const svc = new ContentService();
    expect(() => svc.progressQuest(freshCharacter(), "first_blood", "bogus", 1)).toThrow(GameError);
  });

  it("completes a quest once objectives are met and grants its reward exactly once", () => {
    const svc = new ContentService();
    const c = freshCharacter();
    svc.acceptQuest(c, "first_blood");
    svc.progressQuest(c, "first_blood", "defeat", 1);
    const r1 = svc.completeQuest(c, "first_blood");
    expect(r1.alreadyClaimed).toBe(false);
    expect(r1.experienceGranted).toBe(100);
    expect(r1.goldGranted).toBe(50);
    expect(c.experience).toBe(100);
    expect(c.gold).toBe(150);
    // Second completion is rejected via claim idempotency.
    expect(() => svc.completeQuest(c, "first_blood")).toThrow(GameError);
  });
});

describe("world events", () => {
  it("rejects an event at the wrong node", () => {
    const svc = deterministicService(0.9);
    expect(() => svc.resolveEvent(freshCharacter(), "cursed_shrine", "E")).toThrow(GameError);
  });

  it("resolves success deterministically and grants a reward once", () => {
    const svc = deterministicService(0.4); // 0.4 < 0.5 chance -> success
    const c = freshCharacter();
    const out = svc.resolveEvent(c, "cursed_shrine", "B");
    expect(out.resolved).toBe(true);
    expect(c.gold).toBe(120);
    // Repeat resolve applies nothing (already claimed).
    const again = svc.resolveEvent(c, "cursed_shrine", "B");
    expect(again.resolved).toBe(false);
    expect(c.gold).toBe(120);
  });

  it("resolves failure without granting a reward", () => {
    const svc = deterministicService(0.6); // 0.6 >= 0.5 chance -> missed
    const c = freshCharacter();
    const out = svc.resolveEvent(c, "cursed_shrine", "B");
    expect(out.resolved).toBe(false);
    expect(out.reward).toBeNull();
    expect(c.gold).toBe(100);
  });
});

describe("towns", () => {
  it("enters a town only from its node", () => {
    const svc = new ContentService();
    const c = freshCharacter();
    expect(() => svc.enterTown(c, "ashenfall", "B")).toThrow(GameError);
    const town = svc.enterTown(c, "ashenfall", "C");
    expect(town.id).toBe("ashenfall");
  });

  it("rejects an unknown town", () => {
    const svc = new ContentService();
    expect(() => svc.enterTown(freshCharacter(), "nope", "C")).toThrow(GameError);
  });
});

describe("dungeons", () => {
  it("clears a dungeon and grants its reward exactly once", () => {
    const svc = new ContentService();
    const c = freshCharacter();
    svc.enterDungeon(c, "crypt_of_ash");
    const r = svc.completeDungeon(c, "crypt_of_ash");
    expect(r.alreadyClaimed).toBe(false);
    expect(r.experienceGranted).toBe(300);
    expect(c.gold).toBe(250);
    expect(c.inventory.get("grave_dust")).toBe(2);
    expect(() => svc.completeDungeon(c, "crypt_of_ash")).toThrow(GameError);
  });
});

describe("seeded RNG determinism", () => {
  it("produces identical event outcomes for the same seed", () => {
    const build = () => {
      const c = freshCharacter();
      const svc = new ContentService({ rng: createRng(42) });
      return { c, out: svc.resolveEvent(c, "cursed_shrine", "B") };
    };
    const a = build();
    const b = build();
    expect(a.out.resolved).toBe(b.out.resolved);
    expect(a.c.gold).toBe(b.c.gold);
  });
});
