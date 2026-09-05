import { GameError } from "../engine/errors";
import { createRng, type Rng } from "../engine/rng";
import type { Character } from "../engine/character";
import { RewardService, type RewardResult } from "../rewards/reward-service";
import { validateReward, type RewardDefinition } from "../rewards/reward";

// ---------- Quests ----------
export interface QuestObjectiveDefinition {
  readonly id: string;
  readonly type: "defeat" | "reach_node" | "obtain_item" | "earn_exp";
  readonly target: string;
  readonly amount: number;
}
export interface QuestDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly objectives: readonly QuestObjectiveDefinition[];
  readonly rewards: RewardDefinition;
  readonly prerequisites?: readonly string[];
}
export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: "first_blood",
    name: "First Blood",
    description: "Prove your mettle by defeating a foe.",
    objectives: [{ id: "defeat", type: "defeat", target: "any", amount: 1 }],
    rewards: { id: "q_first_blood", experience: 100, gold: 50 },
  },
  {
    id: "reach_the_village",
    name: "Reach the Old Village",
    description: "Travel to the old village on the board.",
    objectives: [{ id: "reach", type: "reach_node", target: "C", amount: 1 }],
    rewards: { id: "q_reach_village", experience: 50, gold: 25 },
  },
  {
    id: "grim_harvest",
    name: "Grim Harvest",
    description: "Loot the gravewood for a fistful of grave dust.",
    objectives: [{ id: "obtain", type: "obtain_item", target: "grave_dust", amount: 2 }],
    rewards: { id: "q_grim_harvest", experience: 120, gold: 40 },
  },
];

// ---------- World events ----------
export interface WorldEventDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodeId: string;
  /** Server-rolled probability that the encounter is a success. */
  readonly chance: number;
  readonly reward: RewardDefinition;
}
export const WORLD_EVENT_DEFINITIONS: readonly WorldEventDefinition[] = [
  { id: "cursed_shrine", name: "Cursed Shrine", description: "A dark shrine pulses on the path.", nodeId: "B", chance: 0.5, reward: { id: "e_cursed_shrine", experience: 40, gold: 20 } },
  { id: "treasure_cache", name: "Treasure Cache", description: "A half-buried cache gleams.", nodeId: "E", chance: 0.7, reward: { id: "e_treasure_cache", experience: 0, gold: 60 } },
];

// ---------- Towns ----------
export interface TownDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodeId: string;
  readonly services: readonly ("shop" | "heal" | "equipment")[];
}
export const TOWN_DEFINITIONS: readonly TownDefinition[] = [
  { id: "ashenfall", name: "Ashenfall", description: "A grim settlement at the crossroads.", nodeId: "C", services: ["shop", "heal"] },
  { id: "gravewatch", name: "Gravewatch", description: "A fort guarding the barrow-fields.", nodeId: "E", services: ["shop", "equipment"] },
];

// ---------- Dungeons ----------
export interface DungeonDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entryNodeId: string;
  readonly encounters: number;
  readonly reward: RewardDefinition;
}
export const DUNGEON_DEFINITIONS: readonly DungeonDefinition[] = [
  { id: "crypt_of_ash", name: "Crypt of Ash", description: "The burned crypt beneath the gravewood.", entryNodeId: "D", encounters: 3, reward: { id: "d_crypt_of_ash", experience: 300, gold: 150, itemDrops: [{ itemId: "grave_dust", quantity: 2, chance: 1 }] } },
];

// ---------- Registries (validated at load: unique ids + valid rewards) ----------
function makeRegistry<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) {
    if (map.has(item.id)) throw new Error(`Duplicate content id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}
const questMap = makeRegistry(QUEST_DEFINITIONS);
const eventMap = makeRegistry(WORLD_EVENT_DEFINITIONS);
const townMap = makeRegistry(TOWN_DEFINITIONS);
const dungeonMap = makeRegistry(DUNGEON_DEFINITIONS);

for (const q of QUEST_DEFINITIONS) validateReward(q.rewards);
for (const e of WORLD_EVENT_DEFINITIONS) {
  if (typeof e.chance !== "number" || e.chance < 0 || e.chance > 1) throw new Error("Event chance must be in [0,1]");
  validateReward(e.reward);
}
for (const d of DUNGEON_DEFINITIONS) validateReward(d.reward);

export const getQuest = (id: string) => questMap.get(id) ?? null;
export const getWorldEvent = (id: string) => eventMap.get(id) ?? null;
export const getTown = (id: string) => townMap.get(id) ?? null;
export const getDungeon = (id: string) => dungeonMap.get(id) ?? null;
export const allQuests = (): readonly QuestDefinition[] => QUEST_DEFINITIONS;
export const allWorldEvents = (): readonly WorldEventDefinition[] => WORLD_EVENT_DEFINITIONS;
export const allTowns = (): readonly TownDefinition[] => TOWN_DEFINITIONS;
export const allDungeons = (): readonly DungeonDefinition[] => DUNGEON_DEFINITIONS;

export {
  questRewardKey,
  eventRewardKey,
  dungeonRewardKey,
  resolveRewardItems,
  objectiveMet,
  allObjectivesMet,
} from "./rewards";

export {
  MONSTER_DEFINITIONS,
  ENCOUNTER_DEFINITIONS,
  MONSTER_PREFIX,
  getMonster,
  getEncounter,
  encounterForNode,
  allMonsters,
  allEncounters,
  monsterParticipantId,
  isMonsterParticipant,
  monsterForParticipant,
  encounterRewardFor,
  type MonsterDefinition,
  type EncounterDefinition,
} from "./encounters";

export type ContentEventType =
  | "QUEST_ACCEPTED"
  | "QUEST_PROGRESS"
  | "QUEST_COMPLETED"
  | "EVENT_RESOLVED"
  | "TOWN_ENTERED"
  | "DUNGEON_ENTERED"
  | "DUNGEON_COMPLETED";
export interface ContentEvent {
  readonly type: ContentEventType;
  readonly characterId: string;
  readonly data: Record<string, unknown>;
}

export interface ContentServiceOptions {
  rng?: Rng;
  emit?: (event: ContentEvent) => void;
}

/**
 * Authoritative, framework-independent world-content service. All content is
 * data-driven from the registries above. Rewards are granted by delegating to
 * the existing idempotent {@link RewardService}, using a deterministic
 * per-(content, character) reward identity so a repeat claim applies nothing.
 *
 * State is in-memory by design for this phase (per-character quest progress and
 * event/dungeon claims); no DB or migration is required. The server is the sole
 * authority: it (never the client) reports which objectives advanced, where it
 * stands, and which encounters were won.
 */
export class ContentService {
  private readonly rng: Rng;
  private readonly emitCb: (e: ContentEvent) => void;
  private readonly rewards: RewardService;
  private readonly questTag = new Map<string, Set<string>>();
  private readonly progress = new Map<string, Map<string, number>>();
  private readonly claims = new Set<string>();

  constructor(options: ContentServiceOptions = {}) {
    this.rng = options.rng ?? createRng();
    this.emitCb = options.emit ?? (() => undefined);
    this.rewards = new RewardService(this.rng);
  }

  /** Server-started quest for a character. Idempotent. */
  acceptQuest(character: Character, questId: string): void {
    if (!getQuest(questId)) throw new GameError("INVALID_ACTION", `Unknown quest "${questId}"`);
    const set = this.questTag.get(character.id) ?? new Set<string>();
    set.add(questId);
    this.questTag.set(character.id, set);
    this.emitCb({ type: "QUEST_ACCEPTED", characterId: character.id, data: { questId } });
  }

  /**
   * Server-reported authoritative objective progress. The server derives
   * `amount` from its own authoritative game actions; the client never supplies
   * quest progress. Returns the new objective progress.
   */
  progressQuest(character: Character, questId: string, objectiveId: string, amount: number): number {
    const quest = getQuest(questId);
    if (!quest) throw new GameError("INVALID_ACTION", `Unknown quest "${questId}"`);
    if (!quest.objectives.some((o) => o.id === objectiveId)) {
      throw new GameError("INVALID_ACTION", `Unknown objective "${objectiveId}" for quest "${questId}"`);
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new GameError("INVALID_ACTION", "Quest progress must be a positive safe integer");
    }
    const key = `${character.id}:${questId}`;
    const m = this.progress.get(key) ?? new Map<string, number>();
    const next = (m.get(objectiveId) ?? 0) + amount;
    m.set(objectiveId, next);
    this.progress.set(key, m);
    this.emitCb({ type: "QUEST_PROGRESS", characterId: character.id, data: { questId, objectiveId, progress: next } });
    return next;
  }

  /** Complete a quest once all objectives are met; grants its reward exactly once. */
  completeQuest(character: Character, questId: string): RewardResult {
    const quest = getQuest(questId);
    if (!quest) throw new GameError("INVALID_ACTION", `Unknown quest "${questId}"`);
    const key = `quest:${character.id}:${questId}`;
    if (this.claims.has(key)) throw new GameError("INVALID_ACTION", "Quest already completed");
    const m = this.progress.get(`${character.id}:${questId}`) ?? new Map<string, number>();
    const met = quest.objectives.every((o) => (m.get(o.id) ?? 0) >= o.amount);
    if (!met) throw new GameError("INVALID_ACTION", "Quest objectives not met");
    this.claims.add(key);
    const result = this.rewards.grantVictoryReward(character, quest.rewards, {
      combatId: `quest:${questId}:${character.id}`,
      winnerId: character.id,
    });
    this.emitCb({ type: "QUEST_COMPLETED", characterId: character.id, data: { questId, reward: result } });
    return result;
  }

  /** Resolve a world event on its associated node deterministically (server-rolled). */
  resolveEvent(character: Character, eventId: string, nodeId: string): { resolved: boolean; reward: RewardResult | null } {
    const event = getWorldEvent(eventId);
    if (!event) throw new GameError("INVALID_ACTION", `Unknown event "${eventId}"`);
    if (event.nodeId !== nodeId) throw new GameError("INVALID_ACTION", "Event is not at this node");
    const key = `event:${eventId}:${character.id}`;
    if (this.claims.has(key)) return { resolved: false, reward: null };
    this.claims.add(key);
    const success = this.rng.next() < event.chance;
    const reward = success
      ? this.rewards.grantVictoryReward(character, event.reward, {
          combatId: `event:${eventId}:${character.id}`,
          winnerId: character.id,
        })
      : null;
    this.emitCb({ type: "EVENT_RESOLVED", characterId: character.id, data: { eventId, outcome: success ? "success" : "missed", reward } });
    return { resolved: success, reward };
  }

  /** Enter a town only from its associated board node. */
  enterTown(character: Character, townId: string, nodeId: string): TownDefinition {
    const town = getTown(townId);
    if (!town) throw new GameError("INVALID_ACTION", `Unknown town "${townId}"`);
    if (town.nodeId !== nodeId) throw new GameError("INVALID_ACTION", "You are not at this town");
    this.emitCb({ type: "TOWN_ENTERED", characterId: character.id, data: { townId } });
    return town;
  }

  /** Enter a dungeon (server validates the entry node separately). */
  enterDungeon(character: Character, dungeonId: string): DungeonDefinition {
    const dungeon = getDungeon(dungeonId);
    if (!dungeon) throw new GameError("INVALID_ACTION", `Unknown dungeon "${dungeonId}"`);
    this.emitCb({ type: "DUNGEON_ENTERED", characterId: character.id, data: { dungeonId } });
    return dungeon;
  }

  /** Clear a dungeon and grant its cleared reward exactly once. */
  completeDungeon(character: Character, dungeonId: string): RewardResult {
    const dungeon = getDungeon(dungeonId);
    if (!dungeon) throw new GameError("INVALID_ACTION", `Unknown dungeon "${dungeonId}"`);
    const key = `dungeon:${dungeonId}:${character.id}`;
    if (this.claims.has(key)) throw new GameError("INVALID_ACTION", "Dungeon already cleared");
    this.claims.add(key);
    const result = this.rewards.grantVictoryReward(character, dungeon.reward, {
      combatId: `dungeon:${dungeonId}:${character.id}`,
      winnerId: character.id,
    });
    this.emitCb({ type: "DUNGEON_COMPLETED", characterId: character.id, data: { dungeonId, reward: result } });
    return result;
  }

  /** Number of content rewards claimed (diagnostics/tests). */
  get claimedCount(): number {
    return this.claims.size;
  }
}
