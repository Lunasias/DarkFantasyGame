import {
  check,
  index,
  integer,
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
 * Durable dungeon state per character. One row per (character, dungeon). A
 * dungeon is `entered` when the character first steps in and `completed` once
 * cleared. Clearing grants the reward exactly once (guarded by the durable
 * `reward_claims` key and the unique entry key). The `encounter` column tracks
 * how far the character has progressed, so state survives reconnect/restart.
 */
export const dungeonEntries = pgTable(
  "dungeon_entries",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    dungeonId: text("dungeon_id").notNull(),
    status: text("status").notNull().default("entered"),
    encounter: integer("encounter").notNull().default(0),
    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("dungeon_entries_character_id_idx").on(table.characterId),
    uniqueIndex("dungeon_entries_character_dungeon_unique").on(table.characterId, table.dungeonId),
    check("dungeon_entries_status_valid", sql`${table.status} IN ('entered','completed')`),
    check("dungeon_entries_encounter_non_negative", sql`${table.encounter} >= 0`),
  ],
);

export type DungeonEntry = typeof dungeonEntries.$inferSelect;
export type NewDungeonEntry = typeof dungeonEntries.$inferInsert;
