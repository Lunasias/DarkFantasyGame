import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { gameSessions } from "./game-sessions";
import { uuidPk } from "./shared";

/** Append-only event log, mirroring the engine `GameEvent` stream. */
export const gameEvents = pgTable(
  "game_events",
  {
    id: uuidPk(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    sequence: integer("sequence").notNull().default(0),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("game_events_game_session_id_idx").on(table.gameSessionId)],
);

export type GameEvent = typeof gameEvents.$inferSelect;
export type NewGameEvent = typeof gameEvents.$inferInsert;
