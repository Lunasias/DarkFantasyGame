import { createId } from "./id";
import type { CharacterId } from "./types";

/**
 * Base combat/utility stats for a character. These are deliberately simple and
 * extendable: Phase 4 (Combat) will grow this into a richer, tuned system. The
 * engine only needs a stable shape that it can reason about deterministically.
 */
export interface CharacterStats {
  readonly maxHealth: number;
  readonly health: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
}

/**
 * A character is the in-world avatar a {@link Player} controls during a session.
 * It is a value-ish object owned by the engine; it does not know about
 * rendering or networking.
 */
export class Character {
  readonly id: CharacterId;
  name: string;
  readonly archetype: string;
  stats: CharacterStats;
  /** Assigned job id (null until a job is selected via the jobs domain). */
  jobId: string | null = null;
  /** Progression level (starts at 1). */
  level: number;
  /** Total experience gained (starts at 0). */
  experience: number;
  /** Owned items: itemId → quantity (authoritative inventory state). */
  readonly inventory = new Map<string, number>();
  /** Equipped slot → itemId (authoritative equipment state). */
  readonly equipment = new Map<string, string>();

  constructor(
    id: CharacterId,
    name: string,
    archetype: string,
    stats: CharacterStats,
  ) {
    this.id = id;
    this.name = name;
    this.archetype = archetype;
    this.stats = stats;
    this.level = 1;
    this.experience = 0;
  }

  get isAlive(): boolean {
    return this.stats.health > 0;
  }

  /** Apply damage and clamp health at zero. Returns the actual damage dealt. */
  takeDamage(amount: number): number {
    const clamped = Math.max(0, Math.min(amount, this.stats.health));
    this.stats = { ...this.stats, health: this.stats.health - clamped };
    return clamped;
  }

  /** Restore health up to `maxHealth`. Returns the actual amount restored. */
  heal(amount: number): number {
    const available = this.stats.maxHealth - this.stats.health;
    const healed = Math.min(Math.max(0, amount), available);
    this.stats = { ...this.stats, health: this.stats.health + healed };
    return healed;
  }
}

export interface CreateCharacterInput {
  name: string;
  archetype: string;
  stats?: Partial<CharacterStats>;
}

/**
 * Factory with sensible defaults so a character can be created with only a name
 * and an archetype in the initial phase.
 */
export function createCharacter(input: CreateCharacterInput): Character {
  const sanitized = input.name.trim();
  if (sanitized.length === 0) {
    throw new Error("Character name must not be empty");
  }

  const maxHealth = input.stats?.maxHealth ?? 100;
  const base: CharacterStats = {
    maxHealth,
    // Clamp starting health so it can never exceed max health.
    health: Math.min(input.stats?.health ?? maxHealth, maxHealth),
    attack: input.stats?.attack ?? 10,
    defense: input.stats?.defense ?? 5,
    speed: input.stats?.speed ?? 8,
  };

  return new Character(createId(), sanitized, input.archetype, base);
}
