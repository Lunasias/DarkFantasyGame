import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { items } from "./items";
import { shops } from "./shops";
import { timestamps, uuidPk } from "./shared";

/** Per-shop, per-item authoritative listing (buy/sell prices are integers). */
export const shopInventory = pgTable(
  "shop_inventory",
  {
    id: uuidPk(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    buyPrice: integer("buy_price").notNull(),
    sellPrice: integer("sell_price").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("shop_inventory_shop_id_idx").on(table.shopId),
    uniqueIndex("shop_inventory_shop_item_unique").on(table.shopId, table.itemId),
  ],
);

export type ShopInventory = typeof shopInventory.$inferSelect;
export type NewShopInventory = typeof shopInventory.$inferInsert;
