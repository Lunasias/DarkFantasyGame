import type { Rng } from "../engine/rng";
import type { RewardDefinition } from "../rewards/reward";

/**
 * Deterministic reward identities for content claims. These keys are the basis
 * of exactly-once durability: the same (character, content) always maps to the
 * same key, which collides in the unique `reward_claims` index so a reward can
 * never be granted twice — even across concurrent or racing requests.
 */
export const questRewardKey = (characterId: string, questId: string): string => `quest:${questId}:${characterId}`;
export const eventRewardKey = (characterId: string, eventId: string): string => `event:${eventId}:${characterId}`;
export const dungeonRewardKey = (characterId: string, dungeonId: string): string => `dungeon:${dungeonId}:${characterId}`;

/**
 * Resolve a reward's item drops server-side and deterministically. Each drop is
 * kept when the seeded RNG roll falls below its chance; a chance of 1 always
 * drops, 0 never drops. The same seed yields the same items.
 */
export function resolveRewardItems(
  reward: RewardDefinition,
  rng: Rng,
): { itemId: string; quantity: number }[] {
  return (reward.itemDrops ?? [])
    .filter((d) => rng.next() < d.chance)
    .map((d) => ({ itemId: d.itemId, quantity: d.quantity }));
}

/** Whether a single objective's target is satisfied. */
export const objectiveMet = (progress: number, amount: number): boolean => progress >= amount;

/** Whether every objective is satisfied. */
export function allObjectivesMet(progress: Record<string, number>, objectives: readonly { id: string; amount: number }[]): boolean {
  return objectives.every((o) => objectiveMet(progress[o.id] ?? 0, o.amount));
}
