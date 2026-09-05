import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { gameSessions } from "./game-sessions";
import { timestamps, uuidPk } from "./shared";

/** Durable authoritative board position: one row per (session, character). */
export const boardPositions = pgTable(
  "board_positions",
  {
    id: uuidPk(),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull(),
    nodeId: text("node_id").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("board_positions_game_session_id_idx").on(table.gameSessionId),
    uniqueIndex("board_positions_session_character_unique").on(
      table.gameSessionId,
      table.characterId,
    ),
  ],
);

export type BoardPosition = typeof boardPositions.$inferSelect;
export type NewBoardPosition = typeof boardPositions.$inferInsert;
