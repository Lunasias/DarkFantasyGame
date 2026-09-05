import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, uuidPk } from "./shared";
import { users } from "./users";

/** One persistent profile per user — the core of "persistent progression". */
export const playerProfiles = pgTable(
  "player_profiles",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    level: integer("level").notNull().default(1),
    totalGold: integer("total_gold").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index("player_profiles_user_id_idx").on(table.userId),
    uniqueIndex("player_profiles_user_id_unique").on(table.userId),
  ],
);

export type PlayerProfile = typeof playerProfiles.$inferSelect;
export type NewPlayerProfile = typeof playerProfiles.$inferInsert;
