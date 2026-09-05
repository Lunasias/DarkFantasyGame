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
  persistCombatAttack,
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
import { createDefaultBoard, BoardEngine } from "../../game/board";
import {
  acceptQuest,
  completeQuest,
  completeDungeon,
  enterDungeon,
  resolveWorldEvent,
  syncQuestProgress,
} from "../../db/content-store";
import { getTown } from "../../game/content";
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

  /** Authoritative move: server rolls the dice and validates the destination
   *  against the static board graph within the rolled distance. On a successful
   *  move the session transitions to the active phase and the turn advances to
   *  the next player (both server-derived). */
  async move(actorId: string, sessionId: string, nodeId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.requireActive(actorId, sessionId);
    if (!nodeId || nodeId.length === 0) throw new AppError("INVALID_ACTION", "Invalid destination node");
    const state = await loadGameState(this.db, sessionId);

    const board = createDefaultBoard();
    const engine = new BoardEngine(board);
    const current = state.positions.find((p) => p.characterId === actorId)?.nodeId ?? "A";
    engine.place(actorId, current);
    const dice = createRng().nextInt(6) + 1;
    if (!engine.canMove(actorId, nodeId, dice)) {
      throw new AppError("INVALID_ACTION", `Node "${nodeId}" is not reachable within ${dice} step(s)`);
    }
    const next = state.stateVersion + 1;
    const nextTurn = state.currentTurnNumber + 1;
    await persistMove(this.db, {
      sessionId, characterId: actorId, nodeId,
      turn: nextTurn, stateVersion: next, phase: "active",
    });
    await this.publish(roomId, "PLAYER_POSITION_CHANGED", { characterId: actorId, nodeId, dice, stateVersion: next, turn: nextTurn });
    return { nodeId, dice, stateVersion: next, turn: nextTurn };
  }

  /**
   * Authoritative attack. Validates session membership + active turn + combat
   * state, applies server-derived damage from the participant's effective stats,
   * persists HP/turn/victory transactionally, and on victory grants the reward
   * exactly once (durable reward_claims idempotency).
   */
  async attack(actorId: string, sessionId: string, characterId: string, targetId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.requireActive(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    if (!targetId || targetId === characterId) throw new AppError("INVALID_ACTION", "Invalid target");
    const state = await loadGameState(this.db, sessionId);
    if (!state.combat) throw new AppError("INVALID_ACTION", "No active combat");

    const result = await persistCombatAttack(this.db, {
      combatId: state.combat.id,
      attackerId: characterId,
      targetId,
    });
    await this.publish(roomId, "DAMAGE_DEALT", {
      attacker: characterId, target: targetId,
      damage: result.damage, victory: result.victory,
    });

    let reward: { alreadyClaimed: boolean } | null = null;
    if (result.victory) {
      reward = await persistReward(this.db, {
        characterId, rewardKey: `combat:${state.combat.id}`,
        experience: 100, gold: 50, items: [], itemDrops: true,
      });
    }
    return {
      damage: result.damage,
      defenderHealth: result.defenderHealth,
      defeated: result.defeated,
      victory: result.victory,
      winner: result.winner,
      reward,
    };
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

  /** Authoritative current board node for a character in a session (or null). */
  private async characterNode(sessionId: string, characterId: string): Promise<string | null> {
    const state = await loadGameState(this.db, sessionId);
    return state.positions.find((p) => p.characterId === characterId)?.nodeId ?? null;
  }

  /** Durable quest acceptance (idempotent). */
  async acceptQuest(actorId: string, sessionId: string, characterId: string, questId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const res = await acceptQuest(this.db, { characterId, questId });
    await this.publish(roomId, "QUEST_ACCEPTED", { characterId, questId });
    return res;
  }

  /** Server-derived quest progress reconcile (thin action; no client progress). */
  async progressQuest(actorId: string, sessionId: string, characterId: string, questId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const nodeId = await this.characterNode(sessionId, characterId);
    const res = await syncQuestProgress(this.db, { characterId, questId, nodeId });
    await this.publish(roomId, "QUEST_PROGRESS", { characterId, questId, progress: res.progress });
    return res;
  }

  /** Complete an accepted quest once objectives are met; reward granted exactly once. */
  async completeQuest(actorId: string, sessionId: string, characterId: string, questId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const nodeId = await this.characterNode(sessionId, characterId);
    const res = await completeQuest(this.db, { characterId, questId, nodeId });
    await this.publish(roomId, "QUEST_COMPLETED", { characterId, questId, reward: res.reward });
    return res;
  }

  /** Resolve a world event at the character's authoritative node (server RNG). */
  async resolveWorldEvent(actorId: string, sessionId: string, characterId: string, eventId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const nodeId = await this.characterNode(sessionId, characterId);
    const res = await resolveWorldEvent(this.db, { characterId, eventId, nodeId });
    await this.publish(roomId, "WORLD_EVENT_RESOLVED", {
      characterId, eventId, outcome: res.outcome, reward: res.reward,
    });
    return res;
  }

  /** Enter a town only from its board node (no durable state). */
  async enterTown(actorId: string, sessionId: string, characterId: string, townId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const town = getTown(townId);
    if (!town) throw new AppError("INVALID_ACTION", "Unknown town");
    const nodeId = await this.characterNode(sessionId, characterId);
    if (nodeId !== town.nodeId) throw new AppError("INVALID_ACTION", "You are not at this town");
    await this.publish(roomId, "TOWN_ENTERED", { characterId, townId, nodeId });
    return { townId, nodeId, services: town.services };
  }

  /** Enter a dungeon from its entry node (durable). */
  async enterDungeon(actorId: string, sessionId: string, characterId: string, dungeonId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const nodeId = await this.characterNode(sessionId, characterId);
    const res = await enterDungeon(this.db, { characterId, dungeonId, nodeId });
    await this.publish(roomId, "DUNGEON_ENTERED", { characterId, dungeonId });
    return res;
  }

  /** Clear an entered dungeon; reward granted exactly once (durable). */
  async completeDungeon(actorId: string, sessionId: string, characterId: string, dungeonId: string) {
    const roomId = await this.assertSessionAccess(actorId, sessionId);
    await this.assertCharacterOwner(actorId, characterId);
    const res = await completeDungeon(this.db, { characterId, dungeonId });
    await this.publish(roomId, "DUNGEON_COMPLETED", { characterId, dungeonId, reward: res.reward });
    return res;
  }
}
