import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { gameSessions } from "./game-sessions";
import { timestamps, uuidPk } from "./shared";

/** One persisted turn: who acted and the resulting board state snapshot. */
export const turns = pgTable(
  "turns",
  {
    id: uuidPk(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    turnNumber: integer("turn_number").notNull(),
    playerId: uuid("player_id"),
    state: jsonb("state"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("turns_game_session_id_idx").on(table.gameSessionId)],
);

export type Turn = typeof turns.$inferSelect;
export type NewTurn = typeof turns.$inferInsert;
