import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { gameSessions } from "./game-sessions";
import { timestamps, uuidPk } from "./shared";

/** Durable combat encounter state (reconstructed from DB on resume). */
export const combats = pgTable(
  "combats",
  {
    id: uuidPk(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    activeCombatant: text("active_combatant"),
    winner: text("winner"),
    combatTurn: integer("combat_turn").notNull().default(0),
    stateVersion: integer("state_version").notNull().default(0),
    ...timestamps(),
  },
  (table) => [index("combats_game_session_id_idx").on(table.gameSessionId)],
);

export type Combat = typeof combats.$inferSelect;
export type NewCombat = typeof combats.$inferInsert;
