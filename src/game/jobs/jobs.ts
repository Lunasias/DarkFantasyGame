/** Stat modifiers a job applies to a base `CharacterStats`. */
export interface StatModifiers {
  readonly maxHealth?: number;
  readonly health?: number;
  readonly attack?: number;
  readonly defense?: number;
  readonly speed?: number;
}

/**
 * A data-driven job definition. Jobs are passive stat modifiers plus metadata;
 * skills/equipment/spells belong to later phases. New jobs are added here (or in
 * any registry-backed source) without changing Character or Combat.
 */
export interface JobDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modifiers: StatModifiers;
  /** Future capability metadata (skills, armor, spell schools). */
  readonly capabilities: readonly string[];
}

/** Original dark-fantasy jobs (data-driven, no copyrighted IP). */
export const JOB_DEFINITIONS: readonly JobDefinition[] = [
  {
    id: "knight",
    name: "Knight",
    description: "A stalwart front-line defender in heavy plate.",
    modifiers: { maxHealth: 30, attack: 2, defense: 5, speed: -1 },
    capabilities: ["heavy_armor", "shield"],
  },
  {
    id: "berserker",
    name: "Berserker",
    description: "A reckless attacker who trades defense for raw power.",
    modifiers: { maxHealth: 10, attack: 6, defense: -2 },
    capabilities: ["rage", "two_handed"],
  },
  {
    id: "rogue",
    name: "Rogue",
    description: "A swift, precise skirmisher who strikes from the dark.",
    modifiers: { attack: 3, defense: 1, speed: 3 },
    capabilities: ["stealth", "light_armor"],
  },
  {
    id: "mage",
    name: "Mage",
    description: "A fragile caster who channels destructive arcane force.",
    modifiers: { maxHealth: -10, attack: 5, defense: -3 },
    capabilities: ["spellcasting", "arcane"],
  },
  {
    id: "cleric",
    name: "Cleric",
    description: "A devoted sacred warrior who endures and supports.",
    modifiers: { maxHealth: 20, attack: 1, defense: 3 },
    capabilities: ["holy_magic", "medium_armor"],
  },
];
