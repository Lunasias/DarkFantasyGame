import { describe, expect, it } from "vitest";
import { createCharacter } from "@/game/engine";
import { equip, getQuantity } from "@/game/items";
import {
  addGold,
  allShops,
  buyItem,
  buyPrice,
  getGold,
  getShop,
  listShopIds,
  removeGold,
  sellItem,
  sellPrice,
} from "@/game/economy";

function character() {
  return createCharacter({
    name: "Vex",
    archetype: "adventurer",
    stats: { maxHealth: 100, health: 100, attack: 10, defense: 5, speed: 8 },
  });
}

describe("gold", () => {
  it("starts at a safe default", () => {
    expect(getGold(character())).toBe(100);
  });

  it("adds and removes gold", () => {
    const c = character();
    addGold(c, 500);
    expect(getGold(c)).toBe(600);
    removeGold(c, 200);
    expect(getGold(c)).toBe(400);
  });

  it("accepts zero and rejects negative/unsafe amounts", () => {
    const c = character();
    addGold(c, 0);
    expect(getGold(c)).toBe(100);
    expect(() => addGold(c, -5)).toThrow();
    expect(() => removeGold(c, -5)).toThrow();
    expect(() => addGold(c, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => addGold(c, 1.5)).toThrow();
  });

  it("cannot spend more than owned", () => {
    const c = character();
    expect(() => removeGold(c, 200)).toThrow();
    expect(getGold(c)).toBe(100);
  });
});

describe("shops", () => {
  it("defines shops with unique ids", () => {
    expect(allShops().length).toBe(3);
    const ids = listShopIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(getShop("gravekeepers_armory")?.name).toBe("Gravekeeper's Armory");
    expect(getShop("missing")).toBeNull();
  });

  it("exposes item availability and prices", () => {
    const shop = getShop("gravekeepers_armory") as NonNullable<ReturnType<typeof getShop>>;
    expect(buyPrice(shop, "iron_longsword")).toBe(120);
    expect(sellPrice(shop, "iron_longsword")).toBe(60);
    expect(buyPrice(shop, "nightveil_cloak")).toBeNull(); // not in this shop
  });
});

describe("buy", () => {
  it("buys an item atomically (gold down, inventory up)", () => {
    const c = character();
    addGold(c, 500);
    const r = buyItem(c, "gravekeepers_armory", "iron_longsword");
    expect(r.cost).toBe(120);
    expect(getGold(c)).toBe(480);
    expect(getQuantity(c, "iron_longsword")).toBe(1);
  });

  it("buys stackable items in quantity", () => {
    const c = character();
    addGold(c, 1000);
    buyItem(c, "black_ash_general", "grave_dust", 3);
    expect(getQuantity(c, "grave_dust")).toBe(3);
    expect(getGold(c)).toBe(1076); // 1100 - 24
  });

  it("rejects a purchase when gold is insufficient (atomic)", () => {
    const c = character(); // 100 gold, blade costs 260
    expect(() => buyItem(c, "gravekeepers_armory", "gravewarden_blade")).toThrow();
    expect(getGold(c)).toBe(100);
    expect(getQuantity(c, "gravewarden_blade")).toBe(0);
  });

  it("rejects items the shop does not sell and invalid quantities", () => {
    const c = character();
    addGold(c, 500);
    expect(() => buyItem(c, "gravekeepers_armory", "nightveil_cloak")).toThrow();
    expect(() => buyItem(c, "gravekeepers_armory", "iron_longsword", 0)).toThrow();
    expect(() => buyItem(c, "gravekeepers_armory", "iron_longsword", 2)).toThrow(); // non-stackable qty 2
  });
});

describe("sell", () => {
  it("sells an owned item atomically (inventory down, gold up)", () => {
    const c = character();
    addGold(c, 500);
    buyItem(c, "gravekeepers_armory", "iron_longsword"); // gold 480
    const r = sellItem(c, "gravekeepers_armory", "iron_longsword");
    expect(r.proceeds).toBe(60);
    expect(getGold(c)).toBe(540);
    expect(getQuantity(c, "iron_longsword")).toBe(0);
  });

  it("rejects selling more than owned", () => {
    const c = character();
    addGold(c, 500);
    expect(() => sellItem(c, "black_ash_general", "grave_dust", 5)).toThrow();
  });

  it("rejects selling an equipped item until unequipped", () => {
    const c = character();
    addGold(c, 500);
    buyItem(c, "gravekeepers_armory", "iron_longsword");
    equip(c, "iron_longsword");
    expect(() => sellItem(c, "gravekeepers_armory", "iron_longsword")).toThrow();
    expect(getQuantity(c, "iron_longsword")).toBe(1); // still owned + equipped
    expect(c.equipment.get("weapon")).toBe("iron_longsword");
  });

  it("is atomic on failure", () => {
    const c = character();
    addGold(c, 500);
    expect(() => sellItem(c, "black_ash_general", "grave_dust", 1)).toThrow();
    expect(getGold(c)).toBe(600); // unchanged
  });
});

describe("pricing + events", () => {
  it("derives prices server-side (client cannot override)", () => {
    const shop = getShop("black_ash_general") as NonNullable<ReturnType<typeof getShop>>;
    const c = character();
    addGold(c, 1000);
    const r = buyItem(c, "black_ash_general", "grave_dust", 2);
    expect(r.cost).toBe(buyPrice(shop, "grave_dust")! * 2);
  });

  it("emits GOLD_REMOVED then ITEM_PURCHASED on buy", () => {
    const events: unknown[] = [];
    const emit = (e: unknown) => events.push(e);
    const c = character();
    addGold(c, 500);
    buyItem(c, "black_ash_general", "reviving_wisp", 1, { emit });
    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "GOLD_REMOVED",
      "ITEM_PURCHASED",
    ]);
  });

  it("emits GOLD_ADDED then ITEM_SOLD on sell", () => {
    const events: unknown[] = [];
    const emit = (e: unknown) => events.push(e);
    const c = character();
    addGold(c, 1000);
    buyItem(c, "black_ash_general", "grave_dust", 4, { emit: undefined });
    sellItem(c, "black_ash_general", "grave_dust", 2, { emit });
    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "GOLD_ADDED",
      "ITEM_SOLD",
    ]);
  });
});
