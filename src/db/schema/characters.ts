import {
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps, uuidPk } from "./shared";
import { playerProfiles } from "./player-profiles";

/**
 * An in-game avatar owned by a player profile. `archetype` is intentionally a
 * free-text tag for now so the Job system (Phase 6) can expand it without a
 * migration.
 */
export const characters = pgTable(
  "characters",
  {
    id: uuidPk(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => playerProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archetype: text("archetype").notNull().default("adventurer"),
    jobId: text("job_id"),
    level: integer("level").notNull().default(1),
    experience: integer("experience").notNull().default(0),
    gold: integer("gold").notNull().default(100),
    health: integer("health").notNull(),
    maxHealth: integer("max_health").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("characters_profile_id_idx").on(table.profileId),
    check("characters_gold_non_negative", sql`${table.gold} >= 0`),
  ],
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
