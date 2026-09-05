import { GameError } from "../engine/errors";
import { getItem } from "../items/items";

/** A single item drop in a reward. `chance` ∈ [0,1]; `quantity` is integer. */
export interface ItemDrop {
  readonly itemId: string;
  readonly quantity: number;
  readonly chance: number;
}

/** Authoritative, data-driven reward definition (server-derived only). */
export interface RewardDefinition {
  readonly id: string;
  readonly name?: string;
  readonly experience: number;
  readonly gold: number;
  readonly itemDrops?: readonly ItemDrop[];
}

/** Throws if a reward definition is invalid (unsafe/negative/invalid items). */
export function validateReward(reward: RewardDefinition): void {
  for (const value of [reward.experience, reward.gold]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new GameError("INVALID_ACTION", "Reward EXP/Gold must be a non-negative safe integer");
    }
  }
  for (const drop of reward.itemDrops ?? []) {
    validateItemDrop(drop);
  }
}

/** Throws if a single item drop is invalid. */
export function validateItemDrop(drop: ItemDrop): void {
  if (!getItem(drop.itemId)) {
    throw new GameError("INVALID_ACTION", `Reward lists unknown item "${drop.itemId}"`);
  }
  if (!Number.isSafeInteger(drop.quantity) || drop.quantity < 1) {
    throw new GameError("INVALID_ACTION", "Drop quantity must be a positive safe integer");
  }
  if (typeof drop.chance !== "number" || Number.isNaN(drop.chance) || drop.chance < 0 || drop.chance > 1) {
    throw new GameError("INVALID_ACTION", "Drop chance must be in [0, 1]");
  }
}
