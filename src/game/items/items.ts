/**
 * Data-driven item definitions. Original dark-fantasy item names (no copied,
 * copyrighted game items). Items are passive stat modifiers (+ metadata) that
 * flow into the single authoritative effective-stat pipeline.
 */
export type ItemCategory = "equipment" | "material" | "consumable";
export type EquipmentSlot = "weapon" | "armor" | "accessory";

export interface ItemModifiers {
  readonly maxHealth?: number;
  readonly attack?: number;
  readonly defense?: number;
  readonly speed?: number;
}

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  readonly stackable: boolean;
  readonly slot?: EquipmentSlot;
  readonly modifiers?: ItemModifiers;
}

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "weapon",
  "armor",
  "accessory",
];

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  {
    id: "iron_longsword",
    name: "Iron Longsword",
    description: "A reliable, unyielding blade of cold iron.",
    category: "equipment",
    stackable: false,
    slot: "weapon",
    modifiers: { attack: 3 },
  },
  {
    id: "gravewarden_blade",
    name: "Gravewarden Blade",
    description: "A dark blade said to guard the resting dead.",
    category: "equipment",
    stackable: false,
    slot: "weapon",
    modifiers: { attack: 5, defense: 1 },
  },
  {
    id: "ashen_plate",
    name: "Ashen Plate",
    description: "Forged in the fires of a ruined fortress.",
    category: "equipment",
    stackable: false,
    slot: "armor",
    modifiers: { maxHealth: 10, defense: 4 },
  },
  {
    id: "nightveil_cloak",
    name: "Nightveil Cloak",
    description: "A light cloak woven from shadow.",
    category: "equipment",
    stackable: false,
    slot: "armor",
    modifiers: { defense: 2, speed: 2 },
  },
  {
    id: "bloodstone_ring",
    name: "Bloodstone Ring",
    description: "A dark-gemmed ring that quickens the hand.",
    category: "equipment",
    stackable: false,
    slot: "accessory",
    modifiers: { attack: 2, maxHealth: 5 },
  },
  {
    id: "grave_dust",
    name: "Grave Dust",
    description: "Ashes of the fallen (a future crafting material).",
    category: "material",
    stackable: true,
  },
  {
    id: "reviving_wisp",
    name: "Reviving Wisp",
    description: "A faint soul-light (consumable — not yet usable).",
    category: "consumable",
    stackable: true,
  },
];

/** Authoritative item registry (rejects duplicate ids). */
const REGISTRY: ReadonlyMap<string, ItemDefinition> = (() => {
  const map = new Map<string, ItemDefinition>();
  for (const item of ITEM_DEFINITIONS) {
    if (map.has(item.id)) throw new Error(`Duplicate item id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
})();

export function getItem(id: string): ItemDefinition | null {
  return REGISTRY.get(id) ?? null;
}

export function allItems(): readonly ItemDefinition[] {
  return ITEM_DEFINITIONS;
}

export function listItemIds(): readonly string[] {
  return [...REGISTRY.keys()];
}

export function hasItemDef(id: string): boolean {
  return REGISTRY.has(id);
}
