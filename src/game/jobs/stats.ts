import type { CharacterStats } from "../engine/character";
import type { JobDefinition, StatModifiers } from "./jobs";

/**
 * The single authoritative stat-resolution function: base character stats +
 * job modifiers → effective stats. Reused by character/job assignment and by
 * combat adaptation so the calculation never lives in two places. The server
 * is authoritative; clients never submit final calculated stats.
 */
export function resolveEffectiveStats(
  base: CharacterStats,
  job: JobDefinition,
): CharacterStats {
  const mod: StatModifiers = job.modifiers;
  const maxHealth = base.maxHealth + (mod.maxHealth ?? 0);
  const health = Math.min(
    base.health + (mod.health ?? 0) + (mod.maxHealth ?? 0),
    maxHealth,
  );
  return {
    maxHealth,
    health: Math.max(0, health),
    attack: base.attack + (mod.attack ?? 0),
    defense: base.defense + (mod.defense ?? 0),
    speed: base.speed + (mod.speed ?? 0),
  };
}
