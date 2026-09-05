"use server";

import type { ApiResult } from "../../types";
import { getDb } from "../../db";
import { requireUser } from "../../lib/auth/session";
import { runAction } from "../../lib/result";
import { getRealtimeTransport } from "../realtime/hub";
import { GameplayService } from "./gameplay";

/** Authoritative dice roll (membership + active-turn guard). */
export async function rollDiceAction(
  sessionId: string,
): Promise<ApiResult<{ dice: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const service = new GameplayService(db, getRealtimeTransport());
    return service.rollDice(user.id, sessionId);
  });
}

/** Authoritative move on a session (membership + active-turn guard). */
export async function moveSessionAction(
  sessionId: string,
  nodeId: string,
): Promise<ApiResult<{ nodeId: string; dice: number; stateVersion: number; turn: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const service = new GameplayService(db, getRealtimeTransport());
    return service.move(user.id, sessionId, nodeId);
  });
}

/** Authoritative attack on a session (uses the actor's character). */
export async function attackSessionAction(
  sessionId: string,
  characterId: string,
  targetId: string,
): Promise<ApiResult<unknown>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const service = new GameplayService(db, getRealtimeTransport());
    return service.attack(user.id, sessionId, characterId, targetId);
  });
}

async function run(userId: string, fn: (svc: GameplayService) => Promise<unknown>): Promise<ApiResult<unknown>> {
  const db = await getDb();
  return runAction(async () => fn(new GameplayService(db, getRealtimeTransport())));
}

/** Accept a quest for the actor's character. */
export async function acceptQuestAction(sessionId: string, characterId: string, questId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.acceptQuest(user.id, sessionId, characterId, questId));
}

/** Reconcile server-derived quest progress (no client-supplied values). */
export async function progressQuestAction(sessionId: string, characterId: string, questId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.progressQuest(user.id, sessionId, characterId, questId));
}

/** Complete an accepted quest and claim its reward exactly once. */
export async function completeQuestAction(sessionId: string, characterId: string, questId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.completeQuest(user.id, sessionId, characterId, questId));
}

/** Resolve a world event at the character's current node. */
export async function resolveWorldEventAction(sessionId: string, characterId: string, eventId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.resolveWorldEvent(user.id, sessionId, characterId, eventId));
}

/** Enter a town only from its board node. */
export async function enterTownAction(sessionId: string, characterId: string, townId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.enterTown(user.id, sessionId, characterId, townId));
}

/** Enter a dungeon from its entry node. */
export async function enterDungeonAction(sessionId: string, characterId: string, dungeonId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.enterDungeon(user.id, sessionId, characterId, dungeonId));
}

/** Clear a dungeon and claim its reward exactly once. */
export async function completeDungeonAction(sessionId: string, characterId: string, dungeonId: string): Promise<ApiResult<unknown>> {
  const user = await requireUser();
  return run(user.id, (svc) => svc.completeDungeon(user.id, sessionId, characterId, dungeonId));
}
