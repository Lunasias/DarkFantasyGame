import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sessionPhaseEnum } from "./enums";
import { rooms } from "./rooms";
import { timestamps, uuidPk } from "./shared";

/** A started match; the persisted counterpart of the `GameSession` engine. */
export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuidPk(),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    phase: sessionPhaseEnum("phase").notNull().default("lobby"),
    currentTurnNumber: integer("current_turn_number").notNull().default(0),
    stateVersion: integer("state_version").notNull().default(0),
    config: jsonb("config"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("game_sessions_room_id_idx").on(table.roomId)],
);

export type GameSession = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;
