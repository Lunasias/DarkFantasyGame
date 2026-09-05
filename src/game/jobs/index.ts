import type { Character, CharacterStats } from "../engine/character";
import { GameError } from "../engine/errors";
import { combatantFrom, type Combatant } from "../combat/combat-engine";
import { JOB_DEFINITIONS, type JobDefinition } from "./jobs";
import { resolveEffectiveStats } from "./stats";

/** Authoritative job registry (data-driven; new jobs are added to definitions). */
const REGISTRY: ReadonlyMap<string, JobDefinition> = (() => {
  const map = new Map<string, JobDefinition>();
  for (const job of JOB_DEFINITIONS) {
    if (map.has(job.id)) {
      throw new Error(`Duplicate job id "${job.id}"`);
    }
    map.set(job.id, job);
  }
  return map;
})();

export function getJob(id: string): JobDefinition | null {
  return REGISTRY.get(id) ?? null;
}

export function allJobs(): readonly JobDefinition[] {
  return JOB_DEFINITIONS;
}

export function listJobIds(): readonly string[] {
  return [...REGISTRY.keys()];
}

export function hasJob(id: string): boolean {
  return REGISTRY.has(id);
}

/** Event emitted when a job is authoritatively assigned. */
export interface JobAssignedEvent {
  readonly type: "JOB_ASSIGNED";
  readonly characterId: string;
  readonly jobId: string;
}

export interface AssignJobOptions {
  /** True once the game has started — job changes are rejected. */
  started?: boolean;
  /** Optional event sink for the JOB_ASSIGNED authoritative mutation. */
  emit?: (event: JobAssignedEvent) => void;
}

export interface JobAssignmentResult {
  readonly job: JobDefinition;
  readonly effectiveStats: CharacterStats;
}

/**
 * Assign a valid job to a character. The server is authoritative. Job selection
 * is permitted only before a game starts; changing after the game starts is
 * rejected. This does not overwrite the character's base stats (it records the
 * job and returns authoritative effective stats via
 * {@link resolveEffectiveStats}).
 */
export function assignJob(
  character: Character,
  jobId: string,
  options: AssignJobOptions = {},
): JobAssignmentResult {
  const job = getJob(jobId);
  if (!job) {
    throw new GameError("INVALID_ACTION", `Unknown job "${jobId}"`);
  }
  if (options.started) {
    throw new GameError(
      "INVALID_ACTION",
      "Job cannot change after the game has started",
    );
  }
  character.jobId = job.id;
  const effectiveStats = resolveEffectiveStats(character.stats, job);
  options.emit?.({
    type: "JOB_ASSIGNED",
    characterId: character.id,
    jobId: job.id,
  });
  return { job, effectiveStats };
}

/** Effective stats for a character (base stats + assigned job, if any). */
export function effectiveStatsFor(character: Character): CharacterStats {
  if (!character.jobId) return character.stats;
  const job = getJob(character.jobId);
  return job ? resolveEffectiveStats(character.stats, job) : character.stats;
}

/** Adapt a character into a combatant using its authoritative effective stats. */
export function combatantFor(character: Character): Combatant {
  return combatantFrom(character.id, effectiveStatsFor(character));
}

export { JOB_DEFINITIONS, resolveEffectiveStats };
export type { JobDefinition, StatModifiers } from "./jobs";
