import type { Character } from "../engine/character";
import { GameError } from "../engine/errors";
import { hasItem } from "./inventory";
import { getItem, type EquipmentSlot, type ItemModifiers } from "./items";

export type EquipmentEventType = "ITEM_EQUIPPED" | "ITEM_UNEQUIPPED";

export interface EquipmentEvent {
  readonly type: EquipmentEventType;
  readonly characterId: string;
  readonly data: Record<string, string>;
}

export interface EquipmentOptions {
  emit?: (event: EquipmentEvent) => void;
}

/**
 * Authoritative equipment. A character may equip at most one item per slot
 * (weapon/armor/accessory). An equipped item remains owned by the inventory and
 * is only *marked* equipped (never duplicated, never removed). The item's own
 * slot is authoritative — clients never supply a slot or stats.
 */
export function equip(
  character: Character,
  itemId: string,
  options: EquipmentOptions = {},
): EquipmentSlot {
  const item = getItem(itemId);
  if (!item) throw new GameError("INVALID_ACTION", `Unknown item "${itemId}"`);
  if (item.category !== "equipment" || !item.slot) {
    throw new GameError("INVALID_ACTION", "Item is not equippable");
  }
  if (!hasItem(character, itemId)) {
    throw new GameError("INVALID_ACTION", "Item is not owned");
  }
  const slot = item.slot;
  character.equipment.set(slot, itemId); // replaces any prior item in the slot
  options.emit?.({
    type: "ITEM_EQUIPPED",
    characterId: character.id,
    data: { itemId, slot },
  });
  return slot;
}

export function unequip(
  character: Character,
  slot: EquipmentSlot,
  options: EquipmentOptions = {},
): string {
  const itemId = character.equipment.get(slot);
  if (!itemId) {
    throw new GameError("INVALID_ACTION", `Nothing equipped in slot "${slot}"`);
  }
  character.equipment.delete(slot);
  options.emit?.({
    type: "ITEM_UNEQUIPPED",
    characterId: character.id,
    data: { itemId, slot },
  });
  return itemId;
}

export function getEquipped(character: Character, slot: EquipmentSlot): string | null {
  return character.equipment.get(slot) ?? null;
}

/** Sum the stat modifiers of everything currently equipped (authoritative). */
export function equipmentModifiers(character: Character): ItemModifiers {
  const total: { maxHealth: number; attack: number; defense: number; speed: number } = {
    maxHealth: 0,
    attack: 0,
    defense: 0,
    speed: 0,
  };
  for (const slot of character.equipment.keys()) {
    const item = getItem(character.equipment.get(slot) as string);
    if (!item?.modifiers) continue;
    total.maxHealth += item.modifiers.maxHealth ?? 0;
    total.attack += item.modifiers.attack ?? 0;
    total.defense += item.modifiers.defense ?? 0;
    total.speed += item.modifiers.speed ?? 0;
  }
  return total;
}

export function equipmentSlotsInUse(character: Character): readonly { slot: EquipmentSlot; itemId: string }[] {
  return [...character.equipment.entries()].map(([slot, itemId]) => ({ slot: slot as EquipmentSlot, itemId }));
}
