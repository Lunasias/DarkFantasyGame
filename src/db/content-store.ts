import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { characters } from "./schema/characters";
import { characterInventory } from "./schema/character-inventory";
import { characterQuests } from "./schema/character-quests";
import { questProgress } from "./schema/quest-progress";
import { worldEventClaims } from "./schema/world-event-claims";
import { dungeonEntries } from "./schema/dungeon-entries";
import { combats } from "./schema/combats";
import { createId } from "../game/engine/id";
import { GameError } from "../game/engine/errors";
import { createRng, type Rng } from "../game/engine/rng";
import { persistReward } from "./game-store";
import { getQuest, getWorldEvent, getDungeon } from "../game/content";
import type { QuestObjectiveDefinition } from "../game/content";
import {
  questRewardKey,
  eventRewardKey,
  dungeonRewardKey,
  resolveRewardItems,
} from "../game/content/rewards";
import type { RewardDefinition } from "../game/rewards/reward";

export interface QuestObjectiveProgress {
  objectiveId: string;
  target: string;
  amount: number;
  progress: number;
  done: boolean;
}

export interface CharacterContentState {
  quests: {
    questId: string;
    status: "accepted" | "completed";
    objectives: QuestObjectiveProgress[];
  }[];
  worldEvents: { eventId: string; outcome: "success" | "missed" }[];
  dungeons: { dungeonId: string; status: "entered" | "completed"; encounter: number }[];
}

/** Read the complete authoritative content state for one character. */
export async function getCharacterContentState(db: Db, characterId: string): Promise<CharacterContentState> {
  const qs = await db.select().from(characterQuests)
    .where(eq(characterQuests.characterId, characterId))
    .orderBy(asc(characterQuests.acceptedAt));
  const progressRows = await db.select().from(questProgress)
    .where(eq(questProgress.characterId, characterId));
  const events = await db.select().from(worldEventClaims)
    .where(eq(worldEventClaims.characterId, characterId));
  const dungeons = await db.select().from(dungeonEntries)
    .where(eq(dungeonEntries.characterId, characterId));

  const quests = qs.map((q) => {
    const def = getQuest(q.questId);
    const objectives = (def?.objectives ?? []).map((o) => {
      const progress = progressRows
        .find((p) => p.questId === q.questId && p.objectiveId === o.id)?.progress ?? 0;
      return { objectiveId: o.id, target: o.target, amount: o.amount, progress, done: progress >= o.amount };
    });
    return { questId: q.questId, status: q.status as "accepted" | "completed", objectives };
  });

  return {
    quests,
    worldEvents: events.map((e) => ({ eventId: e.eventId, outcome: e.outcome as "success" | "missed" })),
    dungeons: dungeons.map((d) => ({
      dungeonId: d.dungeonId,
      status: d.status as "entered" | "completed",
      encounter: d.encounter,
    })),
  };
}

/** Derived, authoritative value of a single quest objective for a character. */
async function deriveObjective(
  db: Db,
  char: { id: string; experience: number },
  objective: QuestObjectiveDefinition,
  nodeId: string | null,
): Promise<number> {
  switch (objective.type) {
    case "defeat": {
      const won = await db.select({ id: combats.id }).from(combats).where(eq(combats.winner, char.id));
      return won.length;
    }
    case "reach_node":
      return nodeId === objective.target ? 1 : 0;
    case "obtain_item": {
      const [inv] = await db.select().from(characterInventory)
        .where(and(eq(characterInventory.characterId, char.id), eq(characterInventory.itemId, objective.target)))
        .limit(1);
      return inv?.quantity ?? 0;
    }
    case "earn_exp":
      return char.experience;
    default:
      return 0;
  }
}

/**
 * Recompute every objective's progress from authoritative server state and
 * upsert it durably. Returns the resulting progress and whether all are met.
 */
export async function syncQuestProgress(db: Db, input: {
  characterId: string;
  questId: string;
  nodeId: string | null;
}): Promise<{ progress: Record<string, number>; met: boolean }> {
  const quest = getQuest(input.questId);
  if (!quest) throw new GameError("INVALID_ACTION", `Unknown quest "${input.questId}"`);
  const [char] = await db.select().from(characters).where(eq(characters.id, input.characterId)).limit(1);
  if (!char) throw new GameError("INVALID_ACTION", "Character not found");

  const progress: Record<string, number> = {};
  let allMet = true;
  for (const obj of quest.objectives) {
    const value = await deriveObjective(db, char, obj, input.nodeId);
    progress[obj.id] = value;
    if (value < obj.amount) allMet = false;
    await db.insert(questProgress).values({
      id: createId(), characterId: input.characterId,
      questId: input.questId, objectiveId: obj.id, progress: value,
    }).onConflictDoUpdate({
      target: [questProgress.characterId, questProgress.questId, questProgress.objectiveId],
      set: { progress: value },
    });
  }
  return { progress, met: allMet };
}

function rewardItems(reward: RewardDefinition, rng: Rng) {
  return resolveRewardItems(reward, rng);
}

/** Accept a quest durably (idempotent). */
export async function acceptQuest(db: Db, input: { characterId: string; questId: string }): Promise<{ accepted: boolean }> {
  if (!getQuest(input.questId)) throw new GameError("INVALID_ACTION", `Unknown quest "${input.questId}"`);
  const res = await db.insert(characterQuests).values({
    id: createId(), characterId: input.characterId, questId: input.questId, status: "accepted",
  }).onConflictDoNothing();
  return { accepted: res.rowCount === 1 };
}

/**
 * Complete an accepted quest exactly once: derive + persist progress, require
 * all objectives met, grant the reward via the durable idempotent persistReward,
 * then mark the quest completed. Returns the reward result.
 */
export async function completeQuest(db: Db, input: {
  characterId: string;
  questId: string;
  nodeId: string | null;
  rng?: Rng;
}): Promise<{
  met: boolean;
  reward: { alreadyClaimed: boolean; experienceGranted: number; goldGranted: number };
}> {
  const quest = getQuest(input.questId);
  if (!quest) throw new GameError("INVALID_ACTION", `Unknown quest "${input.questId}"`);
  const [c] = await db.select().from(characterQuests)
    .where(and(eq(characterQuests.characterId, input.characterId), eq(characterQuests.questId, input.questId)))
    .limit(1);
  if (!c) throw new GameError("INVALID_ACTION", "Quest is not accepted");
  if (c.status === "completed") throw new GameError("INVALID_ACTION", "Quest already completed");

  const { met } = await syncQuestProgress(db, {
    characterId: input.characterId, questId: input.questId, nodeId: input.nodeId,
  });
  if (!met) throw new GameError("INVALID_ACTION", "Quest objectives not met");

  const rng = input.rng ?? createRng();
  const reward = await persistReward(db, {
    characterId: input.characterId,
    rewardKey: questRewardKey(input.characterId, input.questId),
    experience: quest.rewards.experience,
    gold: quest.rewards.gold,
    items: rewardItems(quest.rewards, rng),
    itemDrops: false,
  });
  if (reward.alreadyClaimed) throw new GameError("INVALID_ACTION", "Quest reward already claimed");
  await db.update(characterQuests).set({ status: "completed", completedAt: new Date() })
    .where(and(eq(characterQuests.characterId, input.characterId), eq(characterQuests.questId, input.questId)));
  return { met, reward };
}

/**
 * Resolve a world event exactly once. Requires the character be at the event's
 * node. Inserts a unique claim, rolls the server RNG for success, and grants
 * the reward via the durable idempotent persistReward. Repeated resolutions are
 * rejected (so a `missed` outcome cannot be re-rolled either).
 */
export async function resolveWorldEvent(db: Db, input: {
  characterId: string;
  eventId: string;
  nodeId: string | null;
  rng?: Rng;
}): Promise<{
  outcome: "success" | "missed";
  reward: { alreadyClaimed: boolean; experienceGranted: number; goldGranted: number } | null;
}> {
  const event = getWorldEvent(input.eventId);
  if (!event) throw new GameError("INVALID_ACTION", `Unknown event "${input.eventId}"`);
  if (event.nodeId !== input.nodeId) throw new GameError("INVALID_ACTION", "You are not at this event's location");

  const RNG = input.rng ?? createRng();
  const insert = await db.insert(worldEventClaims).values({
    id: createId(), characterId: input.characterId, eventId: input.eventId,
    outcome: "success",
  }).onConflictDoNothing();
  if (insert.rowCount === 0) throw new GameError("INVALID_ACTION", "Event already resolved");

  const success = RNG.next() < event.chance;
  await db.update(worldEventClaims).set({ outcome: success ? "success" : "missed" })
    .where(and(eq(worldEventClaims.characterId, input.characterId), eq(worldEventClaims.eventId, input.eventId)));

  if (!success) return { outcome: "missed", reward: null };
  const reward = await persistReward(db, {
    characterId: input.characterId,
    rewardKey: eventRewardKey(input.characterId, input.eventId),
    experience: event.reward.experience,
    gold: event.reward.gold,
    items: rewardItems(event.reward, RNG),
    itemDrops: false,
  });
  return { outcome: "success", reward };
}

/** Enter a dungeon durably (idempotent); requires the entry node. */
export async function enterDungeon(db: Db, input: {
  characterId: string;
  dungeonId: string;
  nodeId: string | null;
}): Promise<{ entered: boolean }> {
  const dungeon = getDungeon(input.dungeonId);
  if (!dungeon) throw new GameError("INVALID_ACTION", `Unknown dungeon "${input.dungeonId}"`);
  if (dungeon.entryNodeId !== input.nodeId) throw new GameError("INVALID_ACTION", "This dungeon is not here");
  const res = await db.insert(dungeonEntries).values({
    id: createId(), characterId: input.characterId, dungeonId: input.dungeonId, status: "entered", encounter: 0,
  }).onConflictDoNothing();
  return { entered: res.rowCount === 1 };
}

/** Clear an entered dungeon exactly once: grant reward durably, then mark done. */
export async function completeDungeon(db: Db, input: {
  characterId: string;
  dungeonId: string;
  rng?: Rng;
}): Promise<{ reward: { alreadyClaimed: boolean; experienceGranted: number; goldGranted: number } }> {
  const dungeon = getDungeon(input.dungeonId);
  if (!dungeon) throw new GameError("INVALID_ACTION", `Unknown dungeon "${input.dungeonId}"`);
  const [entry] = await db.select().from(dungeonEntries)
    .where(and(eq(dungeonEntries.characterId, input.characterId), eq(dungeonEntries.dungeonId, input.dungeonId)))
    .limit(1);
  if (!entry) throw new GameError("INVALID_ACTION", "You have not entered this dungeon");
  if (entry.status === "completed") throw new GameError("INVALID_ACTION", "Dungeon already cleared");

  const rng = input.rng ?? createRng();
  const reward = await persistReward(db, {
    characterId: input.characterId,
    rewardKey: dungeonRewardKey(input.characterId, input.dungeonId),
    experience: dungeon.reward.experience,
    gold: dungeon.reward.gold,
    items: rewardItems(dungeon.reward, rng),
    itemDrops: false,
  });
  if (reward.alreadyClaimed) throw new GameError("INVALID_ACTION", "Dungeon reward already claimed");
  await db.update(dungeonEntries).set({ status: "completed", completedAt: new Date(), encounter: dungeon.encounters })
    .where(and(eq(dungeonEntries.characterId, input.characterId), eq(dungeonEntries.dungeonId, input.dungeonId)));
  return { reward };
}
