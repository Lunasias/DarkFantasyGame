import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { characters } from "./characters";
import { items } from "./items";
import { sql } from "drizzle-orm";
import { timestamps, uuidPk } from "./shared";

/**
 * Authoritative character inventory ownership. One row per (character, item).
 * `equipped_slot` marks an owned item as equipped (weapon/armor/accessory) so an
 * equipped item remains owned, never duplicated, and an item can only be in one
 * slot. A non-negative quantity is enforced at the database level.
 */
export const characterInventory = pgTable(
  "character_inventory",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    equippedSlot: text("equipped_slot"),
    ...timestamps(),
  },
  (table) => [
    index("character_inventory_character_id_idx").on(table.characterId),
    uniqueIndex("character_inventory_character_item_unique").on(
      table.characterId,
      table.itemId,
    ),
    check("character_inventory_quantity_non_negative", sql`${table.quantity} >= 0`),
  ],
);

export type CharacterInventory = typeof characterInventory.$inferSelect;
export type NewCharacterInventory = typeof characterInventory.$inferInsert;
