import { GameError } from "../engine/errors";

/**
 * Framework-independent, data-driven skill definitions and pure effect math.
 * No React, Next.js, browser, or database imports. Damage / healing / mana are
 * always computed server-side from persisted authoritative stats — the client
 * only ever requests an action.
 */

export type SkillTargetType = "enemy" | "self";
export type SkillEffectType = "damage" | "heal";

export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly manaCost: number;
  /** Combat turns before the skill can be used again (0 = always available). */
  readonly cooldown: number;
  readonly target: SkillTargetType;
  readonly effect: SkillEffectType;
  /** Base power (damage) or heal amount. */
  readonly power: number;
  /** For `damage` skills, a multiplier applied to the caster's effective attack. */
  readonly multiplier?: number;
}

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  {
    id: "basic_attack",
    name: "Basic Attack",
    description: "A guaranteed melee blow.",
    manaCost: 0,
    cooldown: 0,
    target: "enemy",
    effect: "damage",
    power: 0,
    multiplier: 1,
  },
  {
    id: "power_strike",
    name: "Power Strike",
    description: "A heavy blow costing mana.",
    manaCost: 10,
    cooldown: 3,
    target: "enemy",
    effect: "damage",
    power: 0,
    multiplier: 2,
  },
  {
    id: "fireball",
    name: "Fireball",
    description: "A burst of flame.",
    manaCost: 20,
    cooldown: 5,
    target: "enemy",
    effect: "damage",
    power: 25,
  },
  {
    id: "heal",
    name: "Heal",
    description: "Restore a little vitality.",
    manaCost: 15,
    cooldown: 4,
    target: "self",
    effect: "heal",
    power: 20,
  },
];

/** Base mana at level 1, plus 10 per level gained. */
export const MAX_MANA_BASE = 50;
export const MAX_MANA_PER_LEVEL = 10;

/** Authoritative maximum mana for a character at a given level. */
export function maxManaFor(level: number): number {
  const clamped = Math.max(1, level);
  return MAX_MANA_BASE + (clamped - 1) * MAX_MANA_PER_LEVEL;
}

const registry = new Map<string, SkillDefinition>();
for (const skill of SKILL_DEFINITIONS) {
  if (registry.has(skill.id)) throw new Error(`Duplicate skill id "${skill.id}"`);
  registry.set(skill.id, skill);
}

/** Throw if a skill definition is invalid (unsafe costs / types). */
export function validateSkillDefinition(skill: SkillDefinition): void {
  if (!Number.isSafeInteger(skill.manaCost) || skill.manaCost < 0) {
    throw new GameError("INVALID_ACTION", "Skill mana cost must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(skill.cooldown) || skill.cooldown < 0) {
    throw new GameError("INVALID_ACTION", "Skill cooldown must be a non-negative safe integer");
  }
  if (skill.target !== "enemy" && skill.target !== "self") {
    throw new GameError("INVALID_ACTION", "Skill must target enemy or self");
  }
  if (skill.effect !== "damage" && skill.effect !== "heal") {
    throw new GameError("INVALID_ACTION", "Skill effect must be damage or heal");
  }
  if (!Number.isSafeInteger(skill.power) || skill.power < 0) {
    throw new GameError("INVALID_ACTION", "Skill power must be a non-negative safe integer");
  }
  if (skill.multiplier !== undefined && (!Number.isSafeInteger(skill.multiplier) || skill.multiplier < 1)) {
    throw new GameError("INVALID_ACTION", "Skill multiplier must be a positive safe integer");
  }
}
for (const s of SKILL_DEFINITIONS) validateSkillDefinition(s);

export const getSkill = (id: string): SkillDefinition | null => registry.get(id) ?? null;
export const allSkills = (): readonly SkillDefinition[] => SKILL_DEFINITIONS;
export const listSkillIds = (): readonly string[] => [...registry.keys()];

/**
 * Authoritative damage for a damage skill:
 *  - multiplier-based (e.g. Power Strike): max(1, effectiveAttack * multiplier - targetDefense)
 *  - power-based (e.g. Fireball): max(1, power - targetDefense)
 * Always integer and at least 1.
 */
export function skillDamage(skill: SkillDefinition, effectiveAttack: number, targetDefense: number): number {
  const base = skill.multiplier ? effectiveAttack * skill.multiplier : skill.power;
  return Math.max(1, base - targetDefense);
}

/** Authoritative heal amount, clamped so HP never exceeds max HP. */
export function healAmount(skill: SkillDefinition, currentHp: number, maxHp: number): number {
  const raw = skill.power;
  // Maximum healable is limited by remaining HP headroom.
  return Math.max(0, Math.min(raw, maxHp - currentHp));
}
