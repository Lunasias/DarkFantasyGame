import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, like } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { users } from "@/db/schema/users";
import { playerProfiles } from "@/db/schema/player-profiles";
import { characters } from "@/db/schema/characters";
import { characterInventory } from "@/db/schema/character-inventory";
import { gameSessions } from "@/db/schema/game-sessions";
import { items } from "@/db/schema/items";
import { shops } from "@/db/schema/shops";
import { shopInventory } from "@/db/schema/shop-inventory";
import { createId } from "@/game/engine/id";
import {
  loadGameState,
  persistCharacter,
  persistCombatComplete,
  persistCombatStart,
  persistInventorySet,
  persistMove,
  persistReward,
  persistShopBuy,
  persistShopSell,
} from "@/db/game-store";

const ENABLED = !!process.env.DATABASE_URL && !process.env.CI;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
const testEmails: string[] = [];
const sessionIds: string[] = [];
const seededItems: string[] = ["grave_dust", "iron_longsword"];
const seededShop = "black_ash_general";

function strip(url: string) {
  return url.replace("&channel_binding=require", "");
}

async function createChar(unique: string) {
  const email = `live_p11_${unique}@x.com`;
  testEmails.push(email);
  const userId = createId();
  const profileId = createId();
  const id = createId();
  await db.insert(users).values({ id: userId, email, displayName: unique });
  await db.insert(playerProfiles).values({ id: profileId, userId, playerName: unique, level: 1, totalGold: 0 });
  await db.insert(characters).values({ id, profileId, name: unique, archetype: "adventurer", level: 1, experience: 0, gold: 100, health: 100, maxHealth: 100 });
  return { userId, profileId, characterId: id };
}

describe.runIf(ENABLED)("Phase 11 persistence (real Neon)", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: strip(process.env.DATABASE_URL as string), max: 5 });
    db = drizzle(pool, { schema });
    await db.insert(items).values({ id: "grave_dust", name: "Grave Dust", description: "d", category: "material", stackable: true });
    await db.insert(items).values({ id: "iron_longsword", name: "Iron Longsword", description: "d", category: "equipment", stackable: false, slot: "weapon" });
    await db.insert(shops).values({ id: seededShop, name: "Black Ash General Store", description: "d" });
    await db.insert(shopInventory).values({ id: createId(), shopId: seededShop, itemId: "grave_dust", buyPrice: 8, sellPrice: 4 });
  });

  afterAll(async () => {
    if (db) {
      if (sessionIds.length) await db.delete(gameSessions).where(eq(gameSessions.id, sessionIds[0]));
      if (testEmails.length) await db.delete(users).where(like(users.email, "live_p11_%"));
      await db.delete(shopInventory).where(eq(shopInventory.shopId, seededShop));
      await db.delete(shops).where(eq(shops.id, seededShop));
      for (const id of seededItems) await db.delete(items).where(eq(items.id, id));
    }
    await pool?.end?.();
  }, 30000);

  it("persists character progression fields (job/level/exp/gold)", async () => {
    const { characterId } = await createChar("char");
    await persistCharacter(db, { id: characterId, jobId: "knight", level: 3, experience: 300, gold: 1500, health: 100, maxHealth: 130 });
    const row = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
    expect(row[0]?.jobId).toBe("knight");
    expect(row[0]?.level).toBe(3);
    expect(row[0]?.experience).toBe(300);
    expect(row[0]?.gold).toBe(1500);
  }, 30000);

  it("persists inventory quantity and equipped slot", async () => {
    const { characterId } = await createChar("inv");
    await persistInventorySet(db, { characterId, itemId: "grave_dust", quantity: 3, equippedSlot: null });
    await persistInventorySet(db, { characterId, itemId: "iron_longsword", quantity: 1, equippedSlot: "weapon" });
    const rows = await db.select().from(characterInventory).where(eq(characterInventory.characterId, characterId));
    expect(rows.find((r) => r.itemId === "grave_dust")?.quantity).toBe(3);
    expect(rows.find((r) => r.itemId === "iron_longsword")?.equippedSlot).toBe("weapon");
  }, 30000);

  it("shop BUY is atomic (gold down, inventory up)", async () => {
    const { characterId } = await createChar("buy");
    const res = await persistShopBuy(db, { characterId, shopId: seededShop, itemId: "grave_dust", quantity: 5 });
    expect(res.cost).toBe(40);
    expect(res.gold).toBe(60);
    const row = await db.select().from(characterInventory).where(and(
      eq(characterInventory.characterId, characterId), eq(characterInventory.itemId, "grave_dust"))).limit(1);
    expect(row[0]?.quantity).toBe(5);
  }, 30000);

  it("shop SELL is atomic (inventory down, gold up) and rejects over-sale", async () => {
    const { characterId } = await createChar("sell");
    await persistShopBuy(db, { characterId, shopId: seededShop, itemId: "grave_dust", quantity: 4 });
    const res = await persistShopSell(db, { characterId, shopId: seededShop, itemId: "grave_dust", quantity: 2 });
    expect(res.proceeds).toBe(8);
    await expect(persistShopSell(db, { characterId, shopId: seededShop, itemId: "grave_dust", quantity: 99 })).rejects.toThrow();
  }, 30000);

  it("reward is durable-idempotent; concurrent identical claims grant exactly once", async () => {
    const { characterId } = await createChar("reward");
    const reward = { characterId, rewardKey: "combat:live-1", experience: 100, gold: 50, items: [{ itemId: "grave_dust", quantity: 1 }], itemDrops: true };
    const [a, b] = await Promise.all([
      persistReward(db, reward),
      persistReward(db, reward),
    ]);
    const grants = [a, b].filter((r) => !r.alreadyClaimed);
    expect(grants.length).toBe(1);
    const row = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
    expect(row[0]?.experience).toBe(100);
    expect(row[0]?.gold).toBe(150);
    const inv = await db.select().from(characterInventory).where(and(
      eq(characterInventory.characterId, characterId), eq(characterInventory.itemId, "grave_dust"))).limit(1);
    expect(inv[0]?.quantity).toBe(1); // never doubled
  }, 30000);

  it("persists board position and loads session state", async () => {
    const { userId, characterId } = await createChar("board");
    const sessionId = createId();
    sessionIds.push(sessionId);
    await db.insert(gameSessions).values({ id: sessionId, roomId: null, phase: "active", currentTurnNumber: 1, stateVersion: 1 });
    await persistMove(db, { sessionId, characterId, nodeId: "B", turn: 1, stateVersion: 1 });
    const state = await loadGameState(db, sessionId);
    expect(state.positions).toContainEqual({ characterId, nodeId: "B" });
    expect(state.phase).toBe("active");
    expect(state.stateVersion).toBe(1);
    void userId;
  }, 30000);

  it("persists combat start + completion", async () => {
    const { characterId } = await createChar("combat");
    const sessionId = createId();
    sessionIds.push(sessionId);
    await db.insert(gameSessions).values({ id: sessionId, roomId: null, phase: "active", currentTurnNumber: 0, stateVersion: 0 });
    const combatId = await persistCombatStart(db, {
      gameSessionId: sessionId,
      participants: [{ characterId, hp: 100, maxHp: 100, attack: 10, defense: 5 }],
    });
    const state = await loadGameState(db, sessionId);
    expect(state.combat?.id).toBe(combatId);
    expect(state.combat?.status).toBe("active");
    await persistCombatComplete(db, combatId, characterId);
    const state2 = await loadGameState(db, sessionId);
    expect(state2.combat?.status).toBe("completed");
    expect(state2.combat?.winner).toBe(characterId);
  }, 30000);
});
