import type { Rng } from "../engine/rng";

/**
 * Deterministic, framework-independent monster AI. The server drives it; it has
 * no database, React, browser, or network dependencies. The client never
 * supplies a decision, target, or damage — the AI only ever returns a target +
 * action, and the authoritative damage is derived in the combat persistence
 * layer from persisted stats.
 */

export type MonsterAction = "attack" | "none";

export interface MonsterDecision {
  readonly action: MonsterAction;
  readonly targetParticipantId: string | null;
  /** Human-readable reason, for server diagnostics/tests. */
  readonly reason: string;
}

export interface MonsterInstant {
  readonly participantId: string;
  readonly alive: boolean;
}

export interface MonsterAiOptions {
  rng: Rng;
}

/**
 * Choose the monster's action for the current turn. The monster targets the
 * first living, non-monster participant (it cannot target itself or a dead
 * participant). If no living target exists it returns a `none` action; the
 * caller must treat that as a harmless stall (combat stays active). Target
 * choice is deterministic for a given RNG.
 */
export function chooseMonsterAction(
  monsterParticipantId: string,
  instants: readonly MonsterInstant[],
  options: MonsterAiOptions,
): MonsterDecision {
  const living = instants.filter(
    (i) => i.participantId !== monsterParticipantId && i.alive,
  );
  if (living.length === 0) {
    return {
      action: "none",
      targetParticipantId: null,
      reason: "no-living-target",
    };
  }

  // With a single living target there is nothing to choose; with several we
  // pick deterministically (seeded RNG) so results are reproducible.
  const index = living.length === 1
    ? 0
    : options.rng.nextInt(living.length);
  return {
    action: "attack",
    targetParticipantId: living[index].participantId,
    reason: "living-target-selected",
  };
}

/** Server-derived PvE damage: `max(1, monsterAttack - targetDefense)`. */
export function monsterDamage(monsterAttack: number, targetDefense: number): number {
  return Math.max(1, monsterAttack - targetDefense);
}
