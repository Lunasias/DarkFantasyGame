import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { roomStatusEnum, roomVisibilityEnum } from "./enums";
import { timestamps, uuidPk } from "./shared";
import { users } from "./users";

/**
 * A pre-game lobby (matching the `Room` domain object).
 *
 * `roomCode` is the short, human-shareable join code and is globally unique.
 * The status column follows the room state machine
 * (waiting/starting/in_game/finished/closed).
 */
export const rooms = pgTable(
  "rooms",
  {
    id: uuidPk(),
    roomCode: text("room_code").notNull(),
    name: text("name").notNull(),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: roomStatusEnum("status").notNull().default("waiting"),
    maxPlayers: integer("max_players").notNull().default(4),
    gameMode: text("game_mode").notNull().default("standard"),
    ruleset: text("ruleset").notNull().default("classic"),
    visibility: roomVisibilityEnum("visibility").notNull().default("public"),
    ...timestamps(),
  },
  (table) => [
    index("rooms_host_user_id_idx").on(table.hostUserId),
    index("rooms_status_idx").on(table.status),
    uniqueIndex("rooms_room_code_unique").on(table.roomCode),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
