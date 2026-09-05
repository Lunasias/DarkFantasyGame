import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./shared";

/** Data-driven shop definitions (referenced by shop inventory pricing rows). */
export const shops = pgTable("shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  ...timestamps(),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
