import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Reusable column builders. Each helper returns a fresh builder so the same
 * definition can be spread into many tables without sharing live column state.
 */

/** `uuid` primary key, auto-generated. */
export function uuidPk() {
  return uuid("id").primaryKey().defaultRandom();
}

/** Standard `created_at` / `updated_at` pair. */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}
