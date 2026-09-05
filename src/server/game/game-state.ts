import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { gameSessions } from "../../db/schema/game-sessions";
import { roomPlayers } from "../../db/schema/room-players";
import { rooms } from "../../db/schema/rooms";
import { characters } from "../../db/schema/characters";
import { playerProfiles } from "../../db/schema/player-profiles";
import { characterInventory } from "../../db/schema/character-inventory";
import { combatParticipants } from "../../db/schema/combat-participants";
import { loadGameState } from "../../db/game-store";
import { getCharacterContentState, type CharacterContentState } from "../../db/content-store";
import { AppError } from "../errors";
import { createCharacter, type CharacterStats } from "../../game/engine/character";
import { effectiveStatsFor } from "../../game/jobs";

/**
 * Complete, server-derived resume snapshot. Authenticates the actor against
 * room membership, then reconstructs durable gameplay state + per-member
 * character state + combat state from the DB. Never exposes private character
 * data of non-members.
 */
export async function getGameSnapshot(db: Db, actorId: string, sessionId: string) {
  const [session] = await db.select().from(gameSessions)
    .where(eq(gameSessions.id, sessionId)).limit(1);
  if (!session) throw new AppError("ROOM_NOT_FOUND", "Game session not found");
  if (!session.roomId) throw new AppError("ROOM_NOT_FOUND", "Session is not attached to a room");

  const [member] = await db.select({ id: roomPlayers.id }).from(roomPlayers)
    .where(and(eq(roomPlayers.roomId, session.roomId), eq(roomPlayers.userId, actorId))).limit(1);
  if (!member) throw new AppError("UNAUTHORIZED", "You are not a member of this session");

  const [room] = await db.select().from(rooms).where(eq(rooms.id, session.roomId)).limit(1);
  const state = await loadGameState(db, sessionId);

  const members = await db.select({ userId: roomPlayers.userId }).from(roomPlayers)
    .where(eq(roomPlayers.roomId, session.roomId)).orderBy(asc(roomPlayers.slot));
  const turn = Math.max(1, session.currentTurnNumber);
  const activePlayer = members.length ? members[(turn - 1) % members.length].userId : null;

  // Per-member character state (first character per profile).
  const charactersOut: {
    characterId: string; userId: string; jobId: string | null; level: number;
    experience: number; health: number; maxHealth: number; gold: number;
    effectiveStats: CharacterStats;
    inventory: { itemId: string; quantity: number }[];
    equipment: Record<string, string>;
  }[] = [];
  for (const m of members) {
    const [profile] = await db.select().from(playerProfiles)
      .where(eq(playerProfiles.userId, m.userId)).limit(1);
    if (!profile) continue;
    const [char] = await db.select().from(characters)
      .where(eq(characters.profileId, profile.id)).limit(1);
    if (!char) continue;
    const invs = await db.select().from(characterInventory)
      .where(eq(characterInventory.characterId, char.id));
    const c = createCharacter({
      name: char.name, archetype: char.archetype,
      stats: { maxHealth: char.maxHealth, health: char.health, attack: 10, defense: 5, speed: 8 },
    });
    c.jobId = char.jobId; c.level = char.level; c.experience = char.experience; c.gold = char.gold;
    for (const inv of invs) {
      c.inventory.set(inv.itemId, inv.quantity);
      if (inv.equippedSlot) c.equipment.set(inv.equippedSlot, inv.itemId);
    }
    charactersOut.push({
      characterId: char.id,
      userId: m.userId,
      jobId: char.jobId,
      level: char.level,
      experience: char.experience,
      health: char.health,
      maxHealth: char.maxHealth,
      gold: char.gold,
      effectiveStats: effectiveStatsFor(c),
      inventory: invs.map((inv) => ({ itemId: inv.itemId, quantity: inv.quantity })),
      equipment: Object.fromEntries(c.equipment),
    });
  }

  let combat: {
    id: string; status: string; activeCombatant: string | null; winner: string | null;
    combatTurn: number; stateVersion: number; combatTurnType: "player" | "monster" | "completed";
    participants: {
      characterId: string; hp: number; maxHp: number; attack: number; defense: number; alive: boolean;
    }[];
  } | null = null;
  if (state.combat) {
    const participants = await db.select().from(combatParticipants)
      .where(eq(combatParticipants.combatId, state.combat.id)).orderBy(asc(combatParticipants.characterId));
    const isMonster = !!state.combat.activeCombatant && state.combat.activeCombatant.startsWith("monster:");
    const combatTurnType = state.combat.status !== "active"
      ? "completed"
      : isMonster
        ? "monster"
        : "player";
    combat = {
      id: state.combat.id,
      status: state.combat.status,
      activeCombatant: state.combat.activeCombatant,
      winner: state.combat.winner,
      combatTurn: state.combat.combatTurn,
      stateVersion: state.combat.stateVersion,
      combatTurnType,
      participants: participants.map((p) => ({
        characterId: p.characterId, hp: p.hp, maxHp: p.maxHp, attack: p.attack, defense: p.defense, alive: p.alive,
      })),
    };
  }

  // Authoritative, per-member content state (quests / events / dungeons). Only
  // exposed for member characters; never leaks another user's private state.
  const content: Record<string, CharacterContentState> = {};
  for (const ch of charactersOut) {
    content[ch.characterId] = await getCharacterContentState(db, ch.characterId);
  }

  return {
    sessionId,
    roomId: session.roomId,
    roomCode: room?.roomCode ?? null,
    phase: state.phase,
    currentTurnNumber: state.currentTurnNumber,
    stateVersion: state.stateVersion,
    activePlayer,
    positions: state.positions,
    characters: charactersOut,
    combat,
    content,
  };
}
