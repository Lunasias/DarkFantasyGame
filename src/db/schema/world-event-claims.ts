import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { characters } from "./characters";
import { uuidPk } from "./shared";

/**
 * Durable world-event resolution per character. One row per (character, event)
 * records the server-rolled outcome (`success` / `missed`). Because the key is
 * unique, an event can only ever be resolved once per character, which (with
 * the durable `reward_claims` key) guarantees a successful reward is granted
 * exactly once. A `missed` outcome still records the attempt and prevents a
 * re-roll.
 */
export const worldEventClaims = pgTable(
  "world_event_claims",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    outcome: text("outcome").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("world_event_claims_character_id_idx").on(table.characterId),
    uniqueIndex("world_event_claims_character_event_unique").on(table.characterId, table.eventId),
    check("world_event_claims_outcome_valid", sql`${table.outcome} IN ('success','missed')`),
  ],
);

export type WorldEventClaim = typeof worldEventClaims.$inferSelect;
export type NewWorldEventClaim = typeof worldEventClaims.$inferInsert;
