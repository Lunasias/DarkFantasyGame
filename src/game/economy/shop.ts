import type { Character } from "../engine/character";
import { GameError } from "../engine/errors";
import { addItem, getQuantity, removeItem } from "../items/inventory";
import { getItem } from "../items/items";
import { addGold, removeGold, type EconomyEvent } from "./gold";
import { buyPrice, getShop, sellPrice, type ShopDefinition } from "./shops";

export interface ShopTradeOptions {
  emit?: (event: EconomyEvent) => void;
}

export interface PurchaseResult {
  readonly itemId: string;
  readonly quantity: number;
  readonly cost: number;
  readonly gold: number;
}

export interface SaleResult {
  readonly itemId: string;
  readonly quantity: number;
  readonly proceeds: number;
  readonly gold: number;
}

function assertQty(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new GameError("INVALID_ACTION", "Quantity must be a positive safe integer");
  }
}

function isEquipped(character: Character, itemId: string): boolean {
  return [...character.equipment.values()].includes(itemId);
}

function requireShop(shopId: string): ShopDefinition {
  const shop = getShop(shopId);
  if (!shop) throw new GameError("INVALID_ACTION", `Unknown shop "${shopId}"`);
  return shop;
}

function requireListing(shop: ShopDefinition, itemId: string) {
  const listing = shop.items.find((l) => l.itemId === itemId);
  if (!listing) throw new GameError("INVALID_ACTION", "Shop does not sell this item");
  return listing;
}

function requireItem(itemId: string) {
  const item = getItem(itemId);
  if (!item) throw new GameError("INVALID_ACTION", `Unknown item "${itemId}"`);
  return item;
}

/**
 * Authoritative, atomic purchase. All rules are validated before any state
 * changes, so a failed purchase leaves gold + inventory untouched. Prices are
 * always derived server-side from the shop definition.
 */
export function buyItem(
  character: Character,
  shopId: string,
  itemId: string,
  quantity = 1,
  options: ShopTradeOptions = {},
): PurchaseResult {
  const shop = requireShop(shopId);
  const item = requireItem(itemId);
  requireListing(shop, itemId);
  assertQty(quantity);

  const price = buyPrice(shop, itemId) as number; // guaranteed by requireListing
  const cost = price * quantity;
  if (!Number.isSafeInteger(cost)) {
    throw new GameError("INVALID_ACTION", "Purchase total is unsafe");
  }
  if (character.gold < cost) {
    throw new GameError("INVALID_ACTION", "Insufficient gold");
  }
  if (!item.stackable) {
    if (quantity !== 1 || getQuantity(character, itemId) > 0) {
      throw new GameError("INVALID_ACTION", "Non-stackable items exist as a single copy");
    }
  }

  // Apply atomically (all preconditions already validated): inventory then gold.
  addItem(character, itemId, quantity);
  removeGold(character, cost, { emit: options.emit });
  options.emit?.({
    type: "ITEM_PURCHASED",
    characterId: character.id,
    data: { itemId, quantity, cost, gold: character.gold },
  });

  return { itemId, quantity, cost, gold: character.gold };
}

/**
 * Authoritative, atomic sale. An equipped item cannot be sold until it is
 * unequipped (never silently unequipped). All rules validated before mutation.
 */
export function sellItem(
  character: Character,
  shopId: string,
  itemId: string,
  quantity = 1,
  options: ShopTradeOptions = {},
): SaleResult {
  const shop = requireShop(shopId);
  requireItem(itemId);
  requireListing(shop, itemId);
  assertQty(quantity);

  const owned = getQuantity(character, itemId);
  if (owned < quantity) {
    throw new GameError("INVALID_ACTION", "Cannot sell more than owned");
  }
  if (isEquipped(character, itemId)) {
    throw new GameError("INVALID_ACTION", "Unequip the item before selling it");
  }
  if (!getItem(itemId)?.stackable && quantity !== 1) {
    throw new GameError("INVALID_ACTION", "Non-stackable items are sold one at a time");
  }

  const price = sellPrice(shop, itemId) as number;
  const proceeds = price * quantity;
  if (!Number.isSafeInteger(proceeds)) {
    throw new GameError("INVALID_ACTION", "Sale total is unsafe");
  }

  // Apply atomically (preconditions validated): inventory then gold.
  removeItem(character, itemId, quantity);
  addGold(character, proceeds, { emit: options.emit });
  options.emit?.({
    type: "ITEM_SOLD",
    characterId: character.id,
    data: { itemId, quantity, proceeds, gold: character.gold },
  });

  return { itemId, quantity, proceeds, gold: character.gold };
}
