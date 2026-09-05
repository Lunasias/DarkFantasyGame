import {
  check,
  index,
  integer,
  jsonb,
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
 * Authoritative, idempotent reward claims. One row per (character, rewardKey)
 * (e.g. `combat:<id>`), so a reward can never be granted twice. Resulting EXP /
 * Gold are stored (never calculated/derived), and non-negative values are
 * enforced at the database level.
 */
export const rewardClaims = pgTable(
  "reward_claims",
  {
    id: uuidPk(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    rewardKey: text("reward_key").notNull(),
    source: text("source").notNull(),
    experience: integer("experience").notNull().default(0),
    gold: integer("gold").notNull().default(0),
    items: jsonb("items"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reward_claims_character_id_idx").on(table.characterId),
    uniqueIndex("reward_claims_character_reward_unique").on(
      table.characterId,
      table.rewardKey,
    ),
    check("reward_claims_experience_non_negative", sql`${table.experience} >= 0`),
    check("reward_claims_gold_non_negative", sql`${table.gold} >= 0`),
  ],
);

export type RewardClaim = typeof rewardClaims.$inferSelect;
export type NewRewardClaim = typeof rewardClaims.$inferInsert;
