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
 * Authoritative quest lifecycle per character. One row per (character, quest).
 * A quest is either `accepted` (in progress) or `completed`. Because the
 * primary key is unique, a quest can only ever be accepted and then completed
 * once per character; duplicate reward claims are separately guarded by the
 * durable `reward_claims` unique key.
 */
export const characterQuests = pgTable(
  "character_quests",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    status: text("status").notNull().default("accepted"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("character_quests_character_id_idx").on(table.characterId),
    uniqueIndex("character_quests_character_quest_unique").on(table.characterId, table.questId),
    check("character_quests_status_valid", sql`${table.status} IN ('accepted','completed')`),
  ],
);

export type CharacterQuest = typeof characterQuests.$inferSelect;
export type NewCharacterQuest = typeof characterQuests.$inferInsert;
