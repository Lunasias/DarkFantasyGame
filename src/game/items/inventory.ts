import type { Character } from "../engine/character";
import { GameError } from "../engine/errors";
import { getItem } from "./items";

export type InventoryEventType = "ITEM_ADDED" | "ITEM_REMOVED";

export interface InventoryEvent {
  readonly type: InventoryEventType;
  readonly characterId: string;
  readonly data: Record<string, number | string>;
}

export interface InventoryOptions {
  emit?: (event: InventoryEvent) => void;
}

function assertQty(quantity: number, positiveRequired: boolean): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new GameError("INVALID_ACTION", "Quantity must be a non-negative safe integer");
  }
  if (positiveRequired && quantity <= 0) {
    throw new GameError("INVALID_ACTION", "Quantity must be positive");
  }
}

/**
 * Authoritative inventory. Owned items live on the character as an
 * `itemId → quantity` map. Stackable items stack; non-stackable equipment exists
 * as a single non-duplicable copy. The server is authoritative — quantities and
 * ownership are never client-supplied.
 */
export function addItem(
  character: Character,
  itemId: string,
  quantity = 1,
  options: InventoryOptions = {},
): number {
  const item = getItem(itemId);
  if (!item) throw new GameError("INVALID_ACTION", `Unknown item "${itemId}"`);
  assertQty(quantity, true);

  if (!item.stackable) {
    // Non-stackable: a single, non-duplicable copy.
    if (quantity !== 1 || (character.inventory.get(itemId) ?? 0) > 0) {
      throw new GameError(
        "INVALID_ACTION",
        "Non-stackable items exist as a single copy",
      );
    }
  }

  const current = character.inventory.get(itemId) ?? 0;
  const next = current + quantity;
  character.inventory.set(itemId, next);
  options.emit?.({
    type: "ITEM_ADDED",
    characterId: character.id,
    data: { itemId, quantity, total: next },
  });
  return next;
}

/** Remove a quantity; rejects removing more than is owned. */
export function removeItem(
  character: Character,
  itemId: string,
  quantity = 1,
  options: InventoryOptions = {},
): number {
  assertQty(quantity, true);
  const current = character.inventory.get(itemId) ?? 0;
  if (current < quantity) {
    throw new GameError("INVALID_ACTION", "Cannot remove more than owned");
  }
  const next = current - quantity;
  if (next === 0) {
    character.inventory.delete(itemId);
  } else {
    character.inventory.set(itemId, next);
  }
  options.emit?.({
    type: "ITEM_REMOVED",
    characterId: character.id,
    data: { itemId, quantity, total: next },
  });
  return next;
}

export function getQuantity(character: Character, itemId: string): number {
  return character.inventory.get(itemId) ?? 0;
}

export function hasItem(character: Character, itemId: string): boolean {
  return getQuantity(character, itemId) > 0;
}
