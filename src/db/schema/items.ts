import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./shared";

/** Data-driven item definitions (referenced by inventory ownership rows). */
export const items = pgTable("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  stackable: boolean("stackable").notNull().default(false),
  slot: text("slot"),
  modifiers: jsonb("modifiers"),
  ...timestamps(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
