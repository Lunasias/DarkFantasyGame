import type { Character } from "../engine/character";
import { assertValidExp, expForLevel, levelForExp, MAX_LEVEL } from "./experience";

export type ProgressionEventType = "EXP_GAINED" | "LEVEL_UP";

export interface ProgressionEvent {
  readonly type: ProgressionEventType;
  readonly characterId: string;
  readonly data: Record<string, number>;
}

export interface GainExperienceResult {
  readonly experience: number;
  readonly level: number;
  readonly levelsGained: number;
  readonly events: readonly ProgressionEvent[];
}

export interface GainExperienceOptions {
  /** Optional event sink for EXP_GAINED / LEVEL_UP events. */
  emit?: (event: ProgressionEvent) => void;
}

/**
 * Authoritative EXP gain + level-up. The server is authoritative: characters
 * never set their own level/EXP. Deterministic, rejects invalid/negative/
 * overflow amounts, supports multi-level jumps, and is bounded by MAX_LEVEL.
 * Recording the EXP in the character's base stats is left to the caller (stats
 * are derived on demand from level + job).
 */
export function addExperience(
  character: Character,
  amount: number,
  options: GainExperienceOptions = {},
): GainExperienceResult {
  assertValidExp(amount);
  const before = character.experience;
  const fromLevel = character.level;

  const experience = before + amount;
  const level = Math.min(levelForExp(experience), MAX_LEVEL);
  const levelsGained = level - fromLevel;

  character.experience = experience;
  character.level = level;

  const events: ProgressionEvent[] = [];
  const gained: ProgressionEvent = {
    type: "EXP_GAINED",
    characterId: character.id,
    data: { amount, experience },
  };
  events.push(gained);
  options.emit?.(gained);

  if (levelsGained > 0) {
    const leveled: ProgressionEvent = {
      type: "LEVEL_UP",
      characterId: character.id,
      data: { from: fromLevel, to: level, levelsGained, experience },
    };
    events.push(leveled);
    options.emit?.(leveled);
  }

  return { experience, level, levelsGained, events };
}

export { expForLevel, levelForExp };
