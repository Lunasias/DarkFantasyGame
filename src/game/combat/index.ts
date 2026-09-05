export { CombatEngine, Combatant, combatantFrom } from "./combat-engine";
export type {
  AttackResult,
  CombatEvent,
  CombatEngineOptions,
  CombatEventType,
} from "./combat-engine";
export { chooseMonsterAction, monsterDamage } from "./monster-ai";
export type { MonsterAction, MonsterDecision, MonsterInstant, MonsterAiOptions } from "./monster-ai";
export {
  SKILL_DEFINITIONS,
  MAX_MANA_BASE,
  MAX_MANA_PER_LEVEL,
  getSkill,
  allSkills,
  listSkillIds,
  validateSkillDefinition,
  maxManaFor,
  skillDamage,
  healAmount,
} from "./skills";
export type { SkillDefinition, SkillTargetType, SkillEffectType } from "./skills";
