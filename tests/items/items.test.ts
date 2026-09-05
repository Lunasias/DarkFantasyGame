import { describe, expect, it } from "vitest";
import { CombatEngine } from "@/game/combat";
import { createCharacter } from "@/game/engine";
import { assignJob, combatantFor } from "@/game/jobs";
import { addExperience } from "@/game/progression";
import {
  addItem,
  allItems,
  equip,
  getEquipped,
  getItem,
  getQuantity,
  hasItem,
  listItemIds,
  removeItem,
  unequip,
} from "@/game/items";

function character() {
  return createCharacter({
    name: "Vex",
    archetype: "adventurer",
    stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
  });
}

function grant(character: ReturnType<typeof createCharacter>, itemId: string, qty = 1) {
  addItem(character, itemId, qty);
}

describe("items", () => {
  it("defines item catalog with unique ids", () => {
    expect(allItems().length).toBeGreaterThanOrEqual(5);
    const ids = listItemIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(getItem("iron_longsword")?.name).toBe("Iron Longsword");
    expect(getItem("missing")).toBeNull();
  });
});

describe("inventory", () => {
  it("adds and increases stackable quantities", () => {
    const c = character();
    addItem(c, "grave_dust", 3);
    expect(getQuantity(c, "grave_dust")).toBe(3);
    addItem(c, "grave_dust", 2);
    expect(getQuantity(c, "grave_dust")).toBe(5);
    expect(hasItem(c, "grave_dust")).toBe(true);
  });

  it("removes and decreases quantity without going negative", () => {
    const c = character();
    addItem(c, "grave_dust", 5);
    removeItem(c, "grave_dust", 2);
    expect(getQuantity(c, "grave_dust")).toBe(3);
    expect(() => removeItem(c, "grave_dust", 50)).toThrow();
    expect(() => addItem(c, "grave_dust", -1)).toThrow();
  });

  it("treats non-stackable equipment as a single non-duplicable copy", () => {
    const c = character();
    grant(c, "iron_longsword");
    expect(getQuantity(c, "iron_longsword")).toBe(1);
    expect(() => addItem(c, "iron_longsword", 1)).toThrow();
    expect(() => addItem(c, "iron_longsword", 2)).toThrow();
    expect(() => addItem(c, "missing_item", 1)).toThrow();
  });
});

describe("equipment", () => {
  it("equips weapon/armor/accessory from owned inventory", () => {
    const c = character();
    for (const id of ["iron_longsword", "ashen_plate", "bloodstone_ring"]) grant(c, id);
    expect(equip(c, "iron_longsword")).toBe("weapon");
    expect(equip(c, "ashen_plate")).toBe("armor");
    expect(equip(c, "bloodstone_ring")).toBe("accessory");
    expect(getEquipped(c, "weapon")).toBe("iron_longsword");
    expect(getEquipped(c, "armor")).toBe("ashen_plate");
  });

  it("rejects unowned, non-armor, and non-equipment items", () => {
    const c = character();
    expect(() => equip(c, "iron_longsword")).toThrow(); // unowned
    grant(c, "grave_dust");
    expect(() => equip(c, "grave_dust")).toThrow(); // not equippable
  });

  it("replaces an equipped item safely (old item remains owned)", () => {
    const c = character();
    grant(c, "iron_longsword");
    grant(c, "gravewarden_blade");
    equip(c, "iron_longsword");
    equip(c, "gravewarden_blade"); // replace
    expect(getEquipped(c, "weapon")).toBe("gravewarden_blade");
    expect(getQuantity(c, "iron_longsword")).toBe(1); // still owned
    expect(getQuantity(c, "gravewarden_blade")).toBe(1);
  });

  it("unequips and keeps the item owned", () => {
    const c = character();
    grant(c, "iron_longsword");
    equip(c, "iron_longsword");
    unequip(c, "weapon");
    expect(getEquipped(c, "weapon")).toBeNull();
    expect(getQuantity(c, "iron_longsword")).toBe(1);
  });
});

describe("equipment stats + combat", () => {
  it("applies equipment attack/defense/maxHealth modifiers", () => {
    const c = character();
    grant(c, "ashen_plate");
    equip(c, "ashen_plate");
    const stats = combatantFor(c);
    expect(stats.maxHealth).toBe(110);
    expect(stats.defense).toBe(9);
  });

  it("stacks job + level + equipment modifiers deterministically", () => {
    const c = character();
    assignJob(c, "knight"); // +30 maxHealth, +2 attack, +5 defense
    addExperience(c, 300); // level 3 → +16 maxHealth, +4 attack, +2 defense
    grant(c, "gravewarden_blade"); // +5 attack, +1 defense
    equip(c, "gravewarden_blade");
    const stats = combatantFor(c);
    expect(stats.maxHealth).toBe(100 + 30 + 16);
    expect(stats.attack).toBe(10 + 2 + 4 + 5);
    expect(stats.defense).toBe(5 + 5 + 2 + 1);
    expect(combatantFor(c)).toEqual(stats); // deterministic
  });

  it("CombatEngine uses equipment-modified combatant stats", () => {
    // give the attacker the blade → attack 15
    const attackerChar = createCharacter({
      name: "A",
      archetype: "adventurer",
      stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
    });
    grant(attackerChar, "gravewarden_blade");
    equip(attackerChar, "gravewarden_blade");
    const defenderChar = createCharacter({
      name: "B",
      archetype: "adventurer",
      stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
    });
    const combat = new CombatEngine([combatantFor(attackerChar), combatantFor(defenderChar)], { now: () => 0 });
    const result = combat.attack(combatantFor(attackerChar).id, combatantFor(defenderChar).id);
    expect(result.damage).toBe(Math.max(1, 15 - 5));
  });
});

describe("events", () => {
  it("emits ITEM_ADDED / ITEM_EQUIPPED / ITEM_UNEQUIPPED in order", () => {
    const events: unknown[] = [];
    const emit = (e: unknown) => events.push(e);
    const c = character();
    addItem(c, "iron_longsword", 1, { emit });
    equip(c, "iron_longsword", { emit });
    unequip(c, "weapon", { emit });
    const types = events.map((e) => (e as { type: string }).type);
    expect(types).toEqual(["ITEM_ADDED", "ITEM_EQUIPPED", "ITEM_UNEQUIPPED"]);
  });
});
