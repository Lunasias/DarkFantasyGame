import { GameError } from "../engine/errors";
import { validateReward, type RewardDefinition } from "../rewards/reward";

/**
 * Data-driven, server-authoritative PvE monsters and encounters.
 *
 * Monsters carry their authoritative stats and reward; the combat snapshot is
 * taken at start (persistCombatStart) exactly like player combatants. There is
 * no PvP: an encounter pits the active challenger's character against a single
 * monster definition. Nothing here is client-authoritative.
 */

export interface MonsterDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxHealth: number;
  readonly attack: number;
  readonly defense: number;
  readonly reward: RewardDefinition;
}

export interface EncounterDefinition {
  readonly id: string;
  readonly nodeId: string;
  readonly monsterId: string;
}

/** Participants for a monster combatant are namespaced with this prefix. */
export const MONSTER_PREFIX = "monster:";

export const MONSTER_DEFINITIONS: readonly MonsterDefinition[] = [
  {
    id: "ash_skeleton",
    name: "Ash Skeleton",
    description: "A brittle husk that refuses to rest.",
    maxHealth: 60,
    attack: 12,
    defense: 6,
    reward: { id: "m_ash_skeleton", experience: 150, gold: 80 },
  },
  {
    id: "grave_husk",
    name: "Grave Husk",
    description: "A bloated thing rooted in the gravewood.",
    maxHealth: 85,
    attack: 14,
    defense: 8,
    reward: { id: "m_grave_husk", experience: 220, gold: 110 },
  },
];

export const ENCOUNTER_DEFINITIONS: readonly EncounterDefinition[] = [
  { id: "skeleton_at_barrow", nodeId: "B", monsterId: "ash_skeleton" },
  { id: "husk_in_gravewood", nodeId: "D", monsterId: "grave_husk" },
];

function registry<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) {
    if (map.has(item.id)) throw new Error(`Duplicate encounter id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}
const monsterMap = registry(MONSTER_DEFINITIONS);
const encounterMap = registry(ENCOUNTER_DEFINITIONS);

for (const m of MONSTER_DEFINITIONS) {
  if (!Number.isSafeInteger(m.maxHealth) || m.maxHealth <= 0) {
    throw new GameError("INVALID_ACTION", `Monster "${m.id}" must have positive health`);
  }
  if (!Number.isSafeInteger(m.attack) || m.attack < 0 || !Number.isSafeInteger(m.defense) || m.defense < 0) {
    throw new GameError("INVALID_ACTION", `Monster "${m.id}" has invalid stats`);
  }
  validateReward(m.reward);
}
for (const e of ENCOUNTER_DEFINITIONS) {
  if (!monsterMap.has(e.monsterId)) {
    throw new GameError("INVALID_ACTION", `Encounter "${e.id}" references unknown monster "${e.monsterId}"`);
  }
}

export const getMonster = (id: string): MonsterDefinition | null => monsterMap.get(id) ?? null;
export const getEncounter = (id: string): EncounterDefinition | null => encounterMap.get(id) ?? null;
export const encounterForNode = (nodeId: string): EncounterDefinition | null =>
  ENCOUNTER_DEFINITIONS.find((e) => e.nodeId === nodeId) ?? null;
export const allMonsters = (): readonly MonsterDefinition[] => MONSTER_DEFINITIONS;
export const allEncounters = (): readonly EncounterDefinition[] => ENCOUNTER_DEFINITIONS;

/** The participant id stored for a monster combatant. */
export const monsterParticipantId = (monsterId: string): string => `${MONSTER_PREFIX}${monsterId}`;
export const isMonsterParticipant = (participantId: string): boolean => participantId.startsWith(MONSTER_PREFIX);

/** Resolve a monster from a combat participant id, if it is one. */
export const monsterForParticipant = (participantId: string): MonsterDefinition | null =>
  isMonsterParticipant(participantId) ? getMonster(participantId.slice(MONSTER_PREFIX.length)) : null;

/** The PvE reward for a combat, or null if the combat is not an encounter. */
export function encounterRewardFor(participantIds: readonly string[]): RewardDefinition | null {
  for (const id of participantIds) {
    const monster = monsterForParticipant(id);
    if (monster) return monster.reward;
  }
  return null;
}
