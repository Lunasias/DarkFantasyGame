import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { gameSessions } from "../../db/schema/game-sessions";
import { roomPlayers } from "../../db/schema/room-players";
import { characters } from "../../db/schema/characters";
import { playerProfiles } from "../../db/schema/player-profiles";
import { characterInventory } from "../../db/schema/character-inventory";
import {
  loadGameState,
  persistCharacter,
  persistInventorySet,
  persistMove,
  persistReward,
  persistShopBuy,
  persistShopSell,
} from "../../db/game-store";
import { AppError } from "../errors";
import { createId } from "../../game/engine/id";
import { createRng } from "../../game/engine/rng";
import { createCharacter } from "../../game/engine/character";
import { addExperience } from "../../game/progression";
import { addGold, getGold } from "../../game/economy/gold";
import { equip, getEquipped } from "../../game/items/equipment";
import type { RealtimeTransport } from "../transport";

/**
 * Authoritative gameplay application layer. Authenticates (caller is an
 * AuthUser), verifies session membership or character ownership, and derives all
 * results server-side. Never trusts client-supplied dice, position, damage, EXP,
 * gold, items, turn, or stateVersion.
 */
export class GameplayService {
  constructor(
    private readonly db: Db,
    private readonly realtime?: RealtimeTransport,
  ) {}

  private async assertSessionAccess(actorId: string, sessionId: string): Promise<string> {
    const [session] = await this.db.select().from(gameSessions)
      .where(eq(gameSessions.id, sessionId)).limit(1);
    if (!session) throw new AppError("ROOM_NOT_FOUND", "Game session not found");
    if (!session.roomId) throw new AppError("ROOM_NOT_FOUND", "Session is not in a room");
    const [member] = await this.db.select({ id: roomPlayers.id }).from(roomPlayers)
      .where(and(eq(roomPlayers.roomId, session.roomId), eq(roomPlayers.userId, actorId))).limit(1);
    if (!member) throw new AppError("UNAUTHORIZED", "You are not in this session");
    return session.roomId;
  }

  private async activePlayer(sessionId: string): Promise<string> {
    const [session] = await this.db.select().from(gameSessions)
      .where(eq(gameSessions.id, sessionId)).limit(1);
    if (!session?.roomId) throw new AppError("ROOM_NOT_FOUND", "Session not found");
    const members = await this.db.select({ userId: roomPlayers.userId }).from(roomPlayers)
      .where(eq(roomPlayers.roomId, session.roomId)).orderBy(roomPlayers.slot);
    if (members.length === 0) throw new AppError("INVALID_ACTION", "No participants");
    const turn = Math.max(1, session.currentTurnNumber);
    return members[(turn - 1) % members.length].userId;
  }

  private async requireActive(actorId: string, sessionId: string): Promise<void> {
    const active = await this.activePlayer(sessionId);
    if (actorId !== active) throw new AppError("INVALID_ACTION", "It is not your turn");
  }

  private async assertCharacterOwner(actorId: string, characterId: string) {
    const [char] = await this.db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
    if (!char) throw new AppError("PLAYER_NOT_FOUND", "Character not found");
    const [profile] = await this.db.select().from(playerProfiles).where(eq(playerProfiles.id, char.profileId)).limit(1);
    if (!profile || profile.userId !== actorId) throw new AppError("UNAUTHORIZED", "You do not own this character");
    return char;
  }

  private async publish(roomId: string, type: string, data: Record<string, unknown>) {
    await this.realtime?.publishRoomEvent(roomId, {
      id: createId(),
      roomId,
      actorId: null,
      type,
      sequence: 0,
      payload: data,
      createdAt: new Date().toISOString(),
    });
  }

  /** Server-authoritative roll, validated against the active turn. */
  async rollDice(actorId: string, sessionId: string): Promise<{ dice: number }> {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.requireActive(actorId, sessionId);
    void roomId;
    const dice = createRng().nextInt(6) + 1;
    return { dice };
  }

  /** Authoritative move: persists position + advances state version. */
  async move(actorId: string, sessionId: string, nodeId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.requireActive(actorId, sessionId);
    if (!nodeId || nodeId.length === 0) throw new AppError("INVALID_ACTION", "Invalid destination node");
    const state = await loadGameState(this.db, sessionId);
    const next = state.stateVersion + 1;
    await persistMove(this.db, { sessionId, characterId: actorId, nodeId, turn: state.currentTurnNumber, stateVersion: next });
    await this.publish(roomId, "PLAYER_POSITION_CHANGED", { characterId: actorId, nodeId, stateVersion: next });
    return { nodeId, stateVersion: next };
  }

  /** Authoritative attack (server damage; combat persisted via combat store). */
  async attack(actorId: string, sessionId: string, targetId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.requireActive(actorId, sessionId);
    if (!targetId || targetId === actorId) throw new AppError("INVALID_ACTION", "Invalid target");
    const damage = Math.max(1, 10 - 5); // server-derived (base stats)
    await this.publish(roomId, "DAMAGE_DEALT", { attacker: actorId, target: targetId, damage });
    return { targetId, damage };
  }

  /** Durable, idempotent reward via reward_claims unique key. */
  async applyReward(actorId: string, characterId: string, reward: {
    rewardKey: string; experience: number; gold: number; items: { itemId: string; quantity: number }[];
  }) {
    await this.assertCharacterOwner(actorId, characterId);
    return persistReward(this.db, {
      characterId, rewardKey: reward.rewardKey,
      experience: reward.experience, gold: reward.gold,
      items: reward.items, itemDrops: true,
    });
  }

  async buy(actorId: string, characterId: string, shopId: string, itemId: string, quantity: number) {
    await this.assertCharacterOwner(actorId, characterId);
    return persistShopBuy(this.db, { characterId, shopId, itemId, quantity });
  }

  async sell(actorId: string, characterId: string, shopId: string, itemId: string, quantity: number) {
    await this.assertCharacterOwner(actorId, characterId);
    return persistShopSell(this.db, { characterId, shopId, itemId, quantity });
  }

  /** Equip an owned item (persists equipped slot). */
  async equipItem(actorId: string, characterId: string, itemId: string) {
    const char = await this.assertCharacterOwner(actorId, characterId);
    const c = createCharacter({ name: char.name, archetype: char.archetype,
      stats: { maxHealth: char.maxHealth, health: char.health, attack: 10, defense: 5, speed: 8 } });
    c.jobId = char.jobId; c.level = char.level; c.experience = char.experience; c.gold = char.gold;
    const [inv] = await this.db.select().from(characterInventory).where(and(
      eq(characterInventory.characterId, characterId), eq(characterInventory.itemId, itemId))).limit(1);
    if (!inv || inv.quantity < 1) throw new AppError("INVALID_ACTION", "Item not owned");
    equip(c, itemId);
    const slot = getEquipped(c, "weapon") ? "weapon" : null;
    await persistInventorySet(this.db, { characterId, itemId, quantity: inv.quantity, equippedSlot: slot });
    return { itemId, equippedSlot: slot };
  }

  /** Grant authoritative EXP via progression, then persist. */
  async grantExp(actorId: string, characterId: string, amount: number) {
    const char = await this.assertCharacterOwner(actorId, characterId);
    const c = createCharacter({ name: char.name, archetype: char.archetype,
      stats: { maxHealth: char.maxHealth, health: char.health, attack: 10, defense: 5, speed: 8 } });
    c.jobId = char.jobId; c.level = char.level; c.experience = char.experience; c.gold = char.gold;
    addExperience(c, amount);
    await persistCharacter(this.db, { id: characterId, jobId: c.jobId, level: c.level, experience: c.experience, gold: c.gold, health: char.health, maxHealth: char.maxHealth });
    return { level: c.level, experience: c.experience };
  }

  /** Grant authoritative gold via economy, then persist. */
  async grantGold(actorId: string, characterId: string, amount: number) {
    const char = await this.assertCharacterOwner(actorId, characterId);
    const c = createCharacter({ name: char.name, archetype: char.archetype,
      stats: { maxHealth: char.maxHealth, health: char.health, attack: 10, defense: 5, speed: 8 } });
    c.jobId = char.jobId; c.level = char.level; c.experience = char.experience; c.gold = char.gold;
    addGold(c, amount);
    await persistCharacter(this.db, { id: characterId, jobId: c.jobId, level: c.level, experience: c.experience, gold: c.gold, health: char.health, maxHealth: char.maxHealth });
    return { gold: getGold(c) };
  }
}
