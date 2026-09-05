import { GameError } from "../engine/errors";
import type { Rng } from "../engine/rng";
import { getItem } from "../items/items";
import type { ItemDrop } from "./reward";

/** One loot-table entry: a drop chance plus a quantity range (integer). */
export interface LootEntry {
  readonly itemId: string;
  readonly minQuantity: number;
  readonly maxQuantity: number;
  readonly chance: number;
}

/** Data-driven loot table (server-side; clients never modify or roll it). */
export interface LootTableDefinition {
  readonly id: string;
  readonly name?: string;
  readonly entries: readonly LootEntry[];
}

export const LOOT_TABLES: readonly LootTableDefinition[] = [
  {
    id: "grave_barrow_loot",
    name: "Grave Barrow Loot",
    entries: [
      { itemId: "grave_dust", minQuantity: 1, maxQuantity: 3, chance: 0.8 },
      { itemId: "iron_longsword", minQuantity: 1, maxQuantity: 1, chance: 0.4 },
      { itemId: "bloodstone_ring", minQuantity: 1, maxQuantity: 1, chance: 0.2 },
      { itemId: "ashen_plate", minQuantity: 1, maxQuantity: 1, chance: 0.15 },
    ],
  },
];

const REGISTRY: ReadonlyMap<string, LootTableDefinition> = (() => {
  const map = new Map<string, LootTableDefinition>();
  for (const table of LOOT_TABLES) {
    if (map.has(table.id)) throw new Error(`Duplicate loot table id "${table.id}"`);
    validateLootTable(table);
    map.set(table.id, table);
  }
  return map;
})();

export function getLootTable(id: string): LootTableDefinition | null {
  return REGISTRY.get(id) ?? null;
}

export function allLootTables(): readonly LootTableDefinition[] {
  return LOOT_TABLES;
}

export function listLootTableIds(): readonly string[] {
  return [...REGISTRY.keys()];
}

/** Throws if a loot table is invalid (items, quantity range, chance). */
export function validateLootTable(table: LootTableDefinition): void {
  for (const entry of table.entries) {
    if (!getItem(entry.itemId)) {
      throw new GameError("INVALID_ACTION", `Loot table lists unknown item "${entry.itemId}"`);
    }
    if (!Number.isSafeInteger(entry.minQuantity) || entry.minQuantity < 1) {
      throw new GameError("INVALID_ACTION", "Loot minQuantity must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(entry.maxQuantity) ||
      entry.maxQuantity < entry.minQuantity
    ) {
      throw new GameError("INVALID_ACTION", "Loot maxQuantity must be >= minQuantity");
    }
    if (typeof entry.chance !== "number" || Number.isNaN(entry.chance) || entry.chance < 0 || entry.chance > 1) {
      throw new GameError("INVALID_ACTION", "Loot chance must be in [0, 1]");
    }
  }
}

/**
 * Resolve a loot table deterministically using the server-authoritative Rng.
 * Same table + same RNG sequence ⇒ same result. Quantity is rolled uniformly in
 * the entry range only when the roll succeeds (chance).
 */
export function resolveLoot(
  table: LootTableDefinition,
  rng: Rng,
): readonly ItemDrop[] {
  validateLootTable(table);
  const drops: ItemDrop[] = [];
  for (const entry of table.entries) {
    if (rng.next() > entry.chance) continue;
    const span = entry.maxQuantity - entry.minQuantity;
    const quantity = entry.minQuantity + (span > 0 ? rng.nextInt(span + 1) : 0);
    drops.push({ itemId: entry.itemId, quantity, chance: entry.chance });
  }
  return drops;
}
