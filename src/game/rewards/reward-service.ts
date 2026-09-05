import type { Character } from "../engine/character";
import { GameError } from "../engine/errors";
import { createRng, type Rng } from "../engine/rng";
import { addGold } from "../economy/gold";
import { addItem, getQuantity } from "../items/inventory";
import { getItem } from "../items/items";
import { addExperience } from "../progression/leveling";
import { resolveLoot, type LootTableDefinition } from "./loot";
import { validateReward, type ItemDrop, type RewardDefinition } from "./reward";

export type RewardEventType =
  | "LOOT_RESOLVED"
  | "EXP_REWARDED"
  | "GOLD_REWARDED"
  | "ITEM_REWARDED"
  | "REWARD_GRANTED";

export interface RewardEvent {
  readonly type: RewardEventType;
  readonly characterId: string;
  readonly rewardId: string;
  readonly data: Record<string, number | string | unknown[]>;
}

export interface RewardResult {
  readonly rewardId: string;
  readonly characterId: string;
  readonly experienceGranted: number;
  readonly goldGranted: number;
  readonly itemsGranted: readonly { itemId: string; quantity: number }[];
  readonly alreadyClaimed: boolean;
}

export interface GrantRewardOptions {
  combatId: string;
  winnerId: string;
  /** Set to false to reject granting a reward for a combat that was not won. */
  won?: boolean;
  /** Optional loot table resolved server-side; otherwise reward.itemDrops are rolled. */
  lootTable?: LootTableDefinition;
  emit?: (event: RewardEvent) => void;
}

/**
 * Authoritative, idempotent, atomic reward application. Reuses the existing
 * EXP (progression), Gold (economy), and Inventory (items) systems — never
 * re-implements them. A reward has a unique authoritative identity (here the
 * combat id); a repeated claim returns the stored result and applies nothing.
 * All rules are validated before any mutation, so a failed reward changes
 * nothing (no partial EXP/gold/items).
 */
export class RewardService {
  private readonly claims = new Map<string, RewardResult>();

  constructor(private readonly rng: Rng = createRng()) {}

  /** Grant a combat victory reward to the winning character. */
  grantVictoryReward(
    character: Character,
    reward: RewardDefinition,
    options: GrantRewardOptions,
  ): RewardResult {
    if (options.won === false) {
      throw new GameError("INVALID_ACTION", "Rewards are only granted on victory");
    }
    if (character.id !== options.winnerId) {
      throw new GameError("INVALID_ACTION", "Only the winner receives victory rewards");
    }

    const rewardId = `combat:${options.combatId}`;
    const existing = this.claims.get(rewardId);
    if (existing) {
      return { ...existing, alreadyClaimed: true };
    }

    validateReward(reward);
    const drops = this.resolveDrops(reward, options.lootTable);
    this.validateInventory(character, drops);

    // Apply atomically (all preconditions validated).
    addExperience(character, reward.experience);
    addGold(character, reward.gold);
    for (const drop of drops) {
      addItem(character, drop.itemId, drop.quantity);
    }

    const itemsGranted = drops.map((d) => ({ itemId: d.itemId, quantity: d.quantity }));
    const result: RewardResult = {
      rewardId,
      characterId: character.id,
      experienceGranted: reward.experience,
      goldGranted: reward.gold,
      itemsGranted,
      alreadyClaimed: false,
    };
    this.claims.set(rewardId, result);

    options.emit?.({
      type: "LOOT_RESOLVED",
      characterId: character.id,
      rewardId,
      data: { items: itemsGranted },
    });
    options.emit?.({
      type: "EXP_REWARDED",
      characterId: character.id,
      rewardId,
      data: { experience: reward.experience, level: character.level, exp: character.experience },
    });
    options.emit?.({
      type: "GOLD_REWARDED",
      characterId: character.id,
      rewardId,
      data: { gold: reward.gold, balance: character.gold },
    });
    for (const drop of drops) {
      options.emit?.({
        type: "ITEM_REWARDED",
        characterId: character.id,
        rewardId,
        data: { itemId: drop.itemId, quantity: drop.quantity },
      });
    }
    options.emit?.({
      type: "REWARD_GRANTED",
      characterId: character.id,
      rewardId,
      data: { experienceGranted: reward.experience, goldGranted: reward.gold, itemsGranted },
    });

    return result;
  }

  private resolveDrops(
    reward: RewardDefinition,
    lootTable?: LootTableDefinition,
  ): readonly ItemDrop[] {
    if (lootTable) {
      return resolveLoot(lootTable, this.rng);
    }
    // Inline drops: roll the per-drop chance, server-side.
    return (reward.itemDrops ?? []).filter((drop) => this.rng.next() < drop.chance);
  }

  /** Reject a reward that would violate inventory rules (no duplicated equipment). */
  private validateInventory(character: Character, drops: readonly ItemDrop[]): void {
    for (const drop of drops) {
      const item = getItem(drop.itemId);
      if (!item) throw new GameError("INVALID_ACTION", `Unknown item "${drop.itemId}"`);
      if (!item.stackable) {
        if (drop.quantity !== 1 || getQuantity(character, drop.itemId) > 0) {
          throw new GameError("INVALID_ACTION", "Equipment loot cannot be duplicated");
        }
      }
    }
  }

  /** Number of distinct rewards claimed (exposed for diagnostics/tests). */
  get claimedCount(): number {
    return this.claims.size;
  }
}
