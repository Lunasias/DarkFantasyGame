import type { CharacterStats } from "../engine/character";

/**
 * Authoritative, deterministic EXP progression model.
 *
 * EXP is cumulative total experience. `expForLevel(level)` is the total EXP
 * required to *reach* a level; it is a pure function of the level so the
 * formula can be tuned in one place. Level-1 growth applies to maxHealth,
 * attack, and defense.
 */

export const MAX_LEVEL = 50;

/** Total EXP required to reach `level` (deterministic, increasing). */
export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level; // L1=0, L2=100, L3=300, L4=600, ...
}

/** EXP required to advance from `level` to `level + 1`. */
export function expToNextLevel(level: number): number {
  return expForLevel(level + 1) - expForLevel(level); // = 100 * level
}

/** Highest level reachable with the given total EXP (clamped to MAX_LEVEL). */
export function levelForExp(exp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && expForLevel(level + 1) <= exp) {
    level += 1;
  }
  return level;
}

/** Sanitize/validate an EXP amount (must be a finite, non-negative integer). */
export function assertValidExp(amount: number): number {
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Experience must be a non-negative safe integer");
  }
  return amount;
}

/** Per-level stat growth (relative to level 1). Health is intentionally left
 *  unchanged so current HP is never reduced by a level-up. */
export function levelStatBonuses(level: number): Partial<CharacterStats> {
  const clamped = Math.max(1, level);
  return {
    maxHealth: (clamped - 1) * 8,
    attack: (clamped - 1) * 2,
    defense: (clamped - 1) * 1,
  };
}
