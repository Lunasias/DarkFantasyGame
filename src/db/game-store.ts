import { and, eq } from "drizzle-orm";
import type { Db } from "./index";
import { characters } from "./schema/characters";
import { characterInventory } from "./schema/character-inventory";
import { boardPositions } from "./schema/board-positions";
import { combats } from "./schema/combats";
import { combatParticipants } from "./schema/combat-participants";
import { gameSessions } from "./schema/game-sessions";
import { rewardClaims } from "./schema/reward-claims";
import { shopInventory } from "./schema/shop-inventory";
import { createId } from "../game/engine/id";
import { GameError } from "../game/engine/errors";
import { isUniqueViolation } from "./util";
import { createCharacter } from "../game/engine/character";
import { addExperience } from "../game/progression/leveling";
import { addGold } from "../game/economy/gold";
import { addItem } from "../game/items/inventory";

/** Reconstruct the authoritative snapshot of a session for resume. */
export async function loadGameState(db: Db, sessionId: string) {
  const [session] = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .limit(1);
  if (!session) throw new GameError("INVALID_ACTION", "Session not found");

  const positions = await db
    .select()
    .from(boardPositions)
    .where(eq(boardPositions.gameSessionId, sessionId));
  const combat = await db
    .select()
    .from(combats)
    .where(eq(combats.gameSessionId, sessionId))
    .limit(1);

  return {
    sessionId,
    phase: session.phase,
    currentTurnNumber: session.currentTurnNumber,
    stateVersion: session.stateVersion,
    positions: positions.map((p) => ({ characterId: p.characterId, nodeId: p.nodeId })),
    combat: combat[0] ?? null,
  };
}

/** Persist the authoritative character progression fields. */
export async function persistCharacter(db: Db, input: {
  id: string;
  jobId: string | null;
  level: number;
  experience: number;
  gold: number;
  health: number;
  maxHealth: number;
}) {
  await db
    .update(characters)
    .set({
      jobId: input.jobId,
      level: input.level,
      experience: input.experience,
      gold: input.gold,
      health: input.health,
      maxHealth: input.maxHealth,
    })
    .where(eq(characters.id, input.id));
}

/** Upsert an inventory row (quantity + equipped slot). */
export async function persistInventorySet(db: Db, input: {
  characterId: string;
  itemId: string;
  quantity: number;
  equippedSlot: string | null;
}) {
  const [row] = await db
    .insert(characterInventory)
    .values({
      id: createId(),
      characterId: input.characterId,
      itemId: input.itemId,
      quantity: input.quantity,
      equippedSlot: input.equippedSlot,
    })
    .onConflictDoUpdate({
      target: [characterInventory.characterId, characterInventory.itemId],
      set: { quantity: input.quantity, equippedSlot: input.equippedSlot },
    })
    .returning();
  return row;
}

/** Persist the authoritative board position for a character in a session. */
export async function persistMove(db: Db, input: {
  sessionId: string;
  characterId: string;
  nodeId: string;
  turn: number;
  stateVersion: number;
  /** When set, also transitions the session phase in the same transaction. */
  phase?: "lobby" | "active" | "finished";
}) {
  await db.transaction(async (tx) => {
    const exec = tx as unknown as Db;
    await exec
      .insert(boardPositions)
      .values({ id: createId(), gameSessionId: input.sessionId, characterId: input.characterId, nodeId: input.nodeId })
      .onConflictDoUpdate({
        target: [boardPositions.gameSessionId, boardPositions.characterId],
        set: { nodeId: input.nodeId },
      });
    await exec
      .update(gameSessions)
      .set({
        currentTurnNumber: input.turn,
        stateVersion: input.stateVersion,
        ...(input.phase ? { phase: input.phase } : {}),
      })
      .where(eq(gameSessions.id, input.sessionId));
  });
}

/**
 * Atomic shop BUY. Locks the character row, derives price server-side, verifies
 * gold, decrements gold, upserts inventory, and commits. No partial state.
 */
export async function persistShopBuy(db: Db, input: {
  characterId: string;
  shopId: string;
  itemId: string;
  quantity: number;
}): Promise<{ cost: number; gold: number }> {
  return db.transaction(async (tx) => {
    const exec = tx as unknown as Db;
    const [shop] = await exec.select().from(shopInventory).where(and(
      eq(shopInventory.shopId, input.shopId),
      eq(shopInventory.itemId, input.itemId),
    )).limit(1);
    if (!shop) throw new GameError("INVALID_ACTION", "Item not sold by shop");
    const cost = shop.buyPrice * input.quantity;

    const [character] = await exec.select().from(characters)
      .where(eq(characters.id, input.characterId)).for("update").limit(1);
    if (!character) throw new GameError("INVALID_ACTION", "Character not found");
    if (character.gold < cost) throw new GameError("INVALID_ACTION", "Insufficient gold");

    await exec.update(characters).set({ gold: character.gold - cost })
      .where(eq(characters.id, input.characterId));
    const existing = await exec.select().from(characterInventory).where(and(
      eq(characterInventory.characterId, input.characterId),
      eq(characterInventory.itemId, input.itemId),
    )).limit(1);
    const qty = (existing[0]?.quantity ?? 0) + input.quantity;
    await exec.insert(characterInventory).values({
      id: createId(), characterId: input.characterId, itemId: input.itemId,
      quantity: qty, equippedSlot: null,
    }).onConflictDoUpdate({
      target: [characterInventory.characterId, characterInventory.itemId],
      set: { quantity: qty },
    });
    return { cost, gold: character.gold - cost };
  });
}

/** Atomic shop SELL (rejects equipped items and over-sale). */
export async function persistShopSell(db: Db, input: {
  characterId: string;
  shopId: string;
  itemId: string;
  quantity: number;
}): Promise<{ proceeds: number; gold: number }> {
  return db.transaction(async (tx) => {
    const exec = tx as unknown as Db;
    const [shop] = await exec.select().from(shopInventory).where(and(
      eq(shopInventory.shopId, input.shopId),
      eq(shopInventory.itemId, input.itemId),
    )).limit(1);
    if (!shop) throw new GameError("INVALID_ACTION", "Item not sold by shop");
    const [character] = await exec.select().from(characters)
      .where(eq(characters.id, input.characterId)).for("update").limit(1);
    if (!character) throw new GameError("INVALID_ACTION", "Character not found");
    const [inv] = await exec.select().from(characterInventory).where(and(
      eq(characterInventory.characterId, input.characterId),
      eq(characterInventory.itemId, input.itemId),
    )).limit(1);
    if ((inv?.quantity ?? 0) < input.quantity) throw new GameError("INVALID_ACTION", "Cannot sell more than owned");
    if (inv?.equippedSlot) throw new GameError("INVALID_ACTION", "Unequip before selling");

    const proceeds = shop.sellPrice * input.quantity;
    const qty = (inv?.quantity ?? 0) - input.quantity;
    await exec.update(characters).set({ gold: character.gold + proceeds })
      .where(eq(characters.id, input.characterId));
    if (qty === 0) {
      await exec.delete(characterInventory).where(eq(characterInventory.id, inv!.id));
    } else {
      await exec.update(characterInventory).set({ quantity: qty }).where(eq(characterInventory.id, inv!.id));
    }
    return { proceeds, gold: character.gold + proceeds };
  });
}

/**
 * Durable idempotent reward: inserts a reward_claim (unique character+rewardKey)
 * and, only if the insert succeeds, grants EXP/gold/items. Concurrent identical
 * claims resolve to ONE reward via the DB unique constraint.
 */
export async function persistReward(db: Db, input: {
  characterId: string;
  rewardKey: string;
  experience: number;
  gold: number;
  items: { itemId: string; quantity: number }[];
  itemDrops: boolean;
}): Promise<{ alreadyClaimed: boolean; experienceGranted: number; goldGranted: number }> {
  try {
    return await db.transaction(async (tx) => {
      const exec = tx as unknown as Db;
      const [character] = await exec.select().from(characters).where(eq(characters.id, input.characterId)).limit(1);
      if (!character) throw new GameError("INVALID_ACTION", "Character not found");

      // Build a Character from DB and reuse the authoritative domain systems.
      const c = createCharacter({ name: character.name, archetype: character.archetype,
        stats: { maxHealth: character.maxHealth, health: character.health, attack: 10, defense: 5, speed: 8 } });
      c.jobId = character.jobId;
      c.level = character.level;
      c.experience = character.experience;
      c.gold = character.gold;
      if (input.experience > 0) addExperience(c, input.experience);
      if (input.gold > 0) addGold(c, input.gold);
      for (const d of input.items) await addItem(c, d.itemId, d.quantity);

      await exec.insert(rewardClaims).values({
        id: createId(), characterId: input.characterId, rewardKey: input.rewardKey,
        source: input.rewardKey, experience: input.experience, gold: input.gold,
        items: input.items,
      });
      await exec.update(characters).set({
        level: c.level, experience: c.experience, gold: c.gold, jobId: c.jobId,
      }).where(eq(characters.id, input.characterId));
      for (const d of input.items) {
        const [inv] = await exec.select().from(characterInventory).where(and(
          eq(characterInventory.characterId, input.characterId),
          eq(characterInventory.itemId, d.itemId),
        )).limit(1);
        const qty = (inv?.quantity ?? 0) + d.quantity;
        await exec.insert(characterInventory).values({
          id: createId(), characterId: input.characterId, itemId: d.itemId, quantity: qty, equippedSlot: null,
        }).onConflictDoUpdate({ target: [characterInventory.characterId, characterInventory.itemId], set: { quantity: qty } });
      }
      return { alreadyClaimed: false, experienceGranted: input.experience, goldGranted: input.gold };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { alreadyClaimed: true, experienceGranted: 0, goldGranted: 0 };
    }
    throw error;
  }
}

/** Create a combat + participants (authoritative snapshot at start). */
export async function persistCombatStart(db: Db, input: {
  gameSessionId: string;
  participants: { characterId: string; hp: number; maxHp: number; attack: number; defense: number }[];
}) {
  return db.transaction(async (tx) => {
    const exec = tx as unknown as Db;
    const combatId = createId();
    await exec.insert(combats).values({
      id: combatId, gameSessionId: input.gameSessionId, status: "active",
      activeCombatant: input.participants[0]?.characterId ?? null, combatTurn: 0, stateVersion: 0,
    });
    for (const p of input.participants) {
      await exec.insert(combatParticipants).values({
        id: createId(), combatId, characterId: p.characterId,
        hp: p.hp, maxHp: p.maxHp, attack: p.attack, defense: p.defense, alive: p.hp > 0,
      });
    }
    return combatId;
  });
}

/** Records a resolved combat (winner / completed); further attacks rejected. */
export async function persistCombatComplete(db: Db, combatId: string, winner: string) {
  await db.update(combats).set({ status: "completed", winner }).where(eq(combats.id, combatId));
}

/**
 * Authoritative combat attack within one transaction: validates combat/active
 * combatant/alive target, computes damage from the participant's effective
 * stats (base→job→level→equipment snapshot captured at start), updates HP,
 * advances the active combatant, and detects victory. Returns server-derived
 * results only.
 */
export async function persistCombatAttack(db: Db, input: {
  combatId: string;
  attackerId: string;
  targetId: string;
}): Promise<{ damage: number; defenderHealth: number; defeated: boolean; victory: boolean; winner: string | null }> {
  return db.transaction(async (tx) => {
    const exec = tx as unknown as Db;
    const [combat] = await exec.select().from(combats).where(eq(combats.id, input.combatId)).for("update").limit(1);
    if (!combat) throw new GameError("INVALID_ACTION", "Combat not found");
    if (combat.status !== "active") throw new GameError("INVALID_ACTION", "Combat has completed");
    if (combat.activeCombatant !== input.attackerId) throw new GameError("NOT_ACTIVE_PLAYER", "It is not this combatant's turn");

    const [attacker] = await exec.select().from(combatParticipants)
      .where(and(eq(combatParticipants.combatId, input.combatId), eq(combatParticipants.characterId, input.attackerId)))
      .for("update").limit(1);
    const [target] = await exec.select().from(combatParticipants)
      .where(and(eq(combatParticipants.combatId, input.combatId), eq(combatParticipants.characterId, input.targetId)))
      .for("update").limit(1);
    if (!attacker || !target || attacker.characterId === target.characterId) throw new GameError("INVALID_ACTION", "Invalid combatants");
    if (!target.alive) throw new GameError("INVALID_ACTION", "Target is already defeated");

    const damage = Math.max(1, attacker.attack - target.defense);
    const newHp = Math.max(0, target.hp - damage);
    const defeated = newHp === 0;
    await exec.update(combatParticipants).set({ hp: newHp, alive: !defeated }).where(eq(combatParticipants.id, target.id));

    const all = await exec.select().from(combatParticipants).where(eq(combatParticipants.combatId, input.combatId));
    const aliveIds = all.filter((p) => p.alive).map((p) => p.characterId);
    const victory = aliveIds.length === 1;
    const winner = victory ? aliveIds[0] : null;

    if (victory) {
      await exec.update(combats).set({ status: "completed", winner, stateVersion: combat.stateVersion + 1 }).where(eq(combats.id, input.combatId));
    } else {
      const idx = aliveIds.indexOf(input.attackerId);
      const nextActive = aliveIds[(idx + 1) % aliveIds.length];
      await exec.update(combats).set({
        activeCombatant: nextActive, combatTurn: combat.combatTurn + 1, stateVersion: combat.stateVersion + 1,
      }).where(eq(combats.id, input.combatId));
    }
    return { damage, defenderHealth: newHp, defeated, victory, winner };
  });
}
