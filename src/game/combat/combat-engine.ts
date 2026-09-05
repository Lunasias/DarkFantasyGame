import { GameError } from "../engine/errors";
import { createId } from "../engine/id";
import type { CharacterStats } from "../engine/character";

/**
 * A combatant in an encounter. Mirrors the existing {@link CharacterStats} shape
 * (maxHealth/health/attack/defense) so a {@link Character} can be adapted to
 * combat without changing the domain. HP is mutable and authoritative.
 */
export class Combatant {
  readonly id: string;
  readonly name: string;
  readonly maxHealth: number;
  readonly attack: number;
  readonly defense: number;
  private hp: number;

  constructor(
    id: string,
    input: { name?: string; maxHealth: number; health?: number; attack: number; defense: number },
  ) {
    if (input.maxHealth < 1 || input.attack < 0 || input.defense < 0) {
      throw new GameError("INVALID_ACTION", "Combatant stats must be valid");
    }
    if (input.health !== undefined && (input.health < 0 || input.health > input.maxHealth)) {
      throw new GameError("INVALID_ACTION", "Combatant health out of range");
    }
    this.id = id;
    this.name = input.name ?? id;
    this.maxHealth = input.maxHealth;
    this.attack = input.attack;
    this.defense = input.defense;
    this.hp = input.health ?? input.maxHealth;
  }

  get health(): number {
    return this.hp;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  /** Apply damage and return the amount actually dealt. */
  takeDamage(amount: number): number {
    const dealt = Math.max(0, Math.min(amount, this.hp));
    this.hp -= dealt;
    return dealt;
  }
}

/** Build a {@link Combatant} from an existing character id + stats. */
export function combatantFrom(charId: string, stats: CharacterStats): Combatant {
  return new Combatant(charId, {
    maxHealth: stats.maxHealth,
    health: stats.health,
    attack: stats.attack,
    defense: stats.defense,
  });
}

export type CombatEventType =
  | "COMBAT_STARTED"
  | "COMBAT_ACTION_ACCEPTED"
  | "DAMAGE_DEALT"
  | "COMBATANT_DEFEATED"
  | "COMBAT_VICTORY"
  | "COMBAT_COMPLETED";

export interface CombatEvent {
  readonly id: string;
  readonly combatId: string;
  readonly sequence: number;
  readonly type: CombatEventType;
  readonly actorId: string | null;
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}

export interface AttackResult {
  readonly combatTurn: number;
  readonly attacker: string;
  readonly defender: string;
  readonly damage: number;
  readonly defenderHealth: number;
  readonly defenderDefeated: boolean;
  readonly victory: boolean;
  readonly stateVersion: number;
}

export interface CombatEngineOptions {
  now?: () => number;
}

const MIN_COMBATANTS = 2;

/**
 * Framework-independent, deterministic, server-authoritative combat domain.
 *
 * The server derives damage, HP changes, turn order, the winner, and completion.
 * A client may request an ATTACK but never supplies damage/HP/winner/result or
 * arbitrary stats. Same combat state + same action ⇒ same result.
 */
export class CombatEngine {
  readonly id: string;
  private readonly combatants: Combatant[];
  private readonly now: () => number;
  private readonly events: CombatEvent[] = [];
  private readonly applied = new Map<number, string>();
  private readonly results = new Map<number, AttackResult>();
  private alive: string[];
  private cursor = 0;
  private combatTurn = 0;
  private eventCounter = 0;
  private stateVersion = 0;
  private status: "active" | "completed" = "active";
  private winnerId: string | null = null;

  constructor(combatants: Combatant[], options: CombatEngineOptions = {}) {
    this.id = createId();
    this.now = options.now ?? (() => Date.now());
    if (combatants.length < MIN_COMBATANTS) {
      throw new GameError("INVALID_ACTION", `At least ${MIN_COMBATANTS} combatants required`);
    }
    const ids = new Set<string>();
    for (const c of combatants) {
      if (ids.has(c.id)) {
        throw new GameError("INVALID_ACTION", "Combatant ids must be unique");
      }
      if (!c.isAlive) {
        throw new GameError("INVALID_ACTION", "All combatants must start alive");
      }
      ids.add(c.id);
    }
    this.combatants = combatants;
    this.alive = combatants.map((c) => c.id);
    this.emit("COMBAT_STARTED", null, { combatants: this.alive });
  }

  get statusValue(): "active" | "completed" {
    return this.status;
  }

  get isActive(): boolean {
    return this.status === "active";
  }

  get winner(): string | null {
    return this.winnerId;
  }

  get currentCombatTurn(): number {
    return this.combatTurn;
  }

  get currentStateVersion(): number {
    return this.stateVersion;
  }

  get activeCombatantId(): string {
    return this.alive[this.cursor % this.alive.length];
  }

  get eventLog(): readonly CombatEvent[] {
    return this.events;
  }

  get combatantIds(): readonly string[] {
    return this.combatants.map((c) => c.id);
  }

  getCombatant(id: string): Combatant | null {
    return this.combatants.find((c) => c.id === id) ?? null;
  }

  /** Resolve an ATTACK by the active combatant against a target. */
  attack(
    attackerId: string,
    targetId: string,
    opts: { expectedCombatTurn?: number; idempotencyKey?: string } = {},
  ): AttackResult {
    if (this.status !== "active") {
      throw new GameError("INVALID_ACTION", "Combat has ended");
    }
    const attacker = this.requireCombatant(attackerId, "Attacker is not in this combat");
    const defender = this.requireCombatant(targetId, "Target is not in this combat");
    if (attackerId === targetId) {
      throw new GameError("INVALID_ACTION", "A combatant cannot attack itself");
    }

    const key = opts.idempotencyKey ?? `${attackerId}->${targetId}`;
    const turn = opts.expectedCombatTurn ?? this.currentCombatTurn;

    // Idempotency first: a repeated submission of the same attack is a no-op.
    if (this.applied.get(turn) === key && this.results.has(turn)) {
      return this.results.get(turn) as AttackResult;
    }
    // Stale combat turn.
    if (turn !== this.currentCombatTurn) {
      throw new GameError("STALE_ACTION", "Action is for a stale combat turn");
    }
    // A different action for an already-resolved combat turn is a duplicate.
    if (this.results.has(turn)) {
      throw new GameError("DUPLICATE_ACTION", "A different action already resolved this combat turn");
    }
    // The active combatant must be the attacker.
    if (this.activeCombatantId !== attackerId) {
      throw new GameError("NOT_ACTIVE_PLAYER", "It is not this combatant's turn");
    }
    if (!defender.isAlive) {
      throw new GameError("INVALID_ACTION", "Target is already defeated");
    }

    this.emit("COMBAT_ACTION_ACCEPTED", attackerId, {
      attacker: attackerId,
      target: targetId,
      combatTurn: this.currentCombatTurn,
    });

    // damage = max(1, attack - defense) — deterministic.
    const damage = Math.max(1, attacker.attack - defender.defense);
    defender.takeDamage(damage);
    this.stateVersion += 1;

    const defeated = !defender.isAlive;
    this.emit("DAMAGE_DEALT", attackerId, {
      attacker: attackerId,
      target: targetId,
      damage,
      defenderHealth: defender.health,
    });

    if (defeated) {
      this.emit("COMBATANT_DEFEATED", attackerId, { defeated: targetId });
      this.alive = this.alive.filter((id) => id !== targetId);
    }

    const victory = this.alive.length === 1;
    let victoryWinner: string | null = null;

    const result: AttackResult = {
      combatTurn: this.currentCombatTurn,
      attacker: attackerId,
      defender: targetId,
      damage,
      defenderHealth: defender.health,
      defenderDefeated: defeated,
      victory,
      stateVersion: this.currentStateVersion,
    };
    this.results.set(this.currentCombatTurn, result);
    this.applied.set(this.currentCombatTurn, key);

    if (victory) {
      victoryWinner = this.alive[0];
      this.winnerId = victoryWinner;
      this.status = "completed";
      this.emit("COMBAT_VICTORY", attackerId, { winner: victoryWinner });
      this.emit("COMBAT_COMPLETED", attackerId, { winner: victoryWinner });
    } else {
      // Advance combat turn to the next living combatant after the attacker.
      const actorIndex = this.alive.indexOf(attackerId);
      this.cursor = (actorIndex + 1) % this.alive.length;
      this.combatTurn += 1;
    }

    return result;
  }

  private requireCombatant(id: string, message: string): Combatant {
    const combatant = this.getCombatant(id);
    if (!combatant) {
      throw new GameError("INVALID_ACTION", message);
    }
    return combatant;
  }

  private emit(type: CombatEventType, actorId: string | null, data?: Record<string, unknown>): void {
    this.eventCounter += 1;
    this.events.push({
      id: createId(),
      combatId: this.id,
      sequence: this.eventCounter,
      type,
      actorId,
      data,
      timestamp: this.now(),
    });
  }
}
