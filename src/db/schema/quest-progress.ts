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
 * Server-derived progress. One row per (character, quest, objective). Progress
 * is recomputed by the server from authoritative gameplay state (combat wins,
 * board position, inventory, experience) — never supplied by a client. A single
 * row per objective makes repeated progress idempotent and replay-safe.
 */
export const questProgress = pgTable(
  "quest_progress",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    objectiveId: text("objective_id").notNull(),
    progress: integer("progress").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("quest_progress_character_id_idx").on(table.characterId),
    uniqueIndex("quest_progress_character_quest_objective_unique").on(
      table.characterId,
      table.questId,
      table.objectiveId,
    ),
    check("quest_progress_non_negative", sql`${table.progress} >= 0`),
  ],
);

export type QuestProgress = typeof questProgress.$inferSelect;
export type NewQuestProgress = typeof questProgress.$inferInsert;
