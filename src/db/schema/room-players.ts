import {
  index,
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, uuidPk } from "./shared";
import { rooms } from "./rooms";
import { users } from "./users";

/** Join table: which players are seated in a room, with host/ready flags. */
export const roomPlayers = pgTable(
  "room_players",
  {
    id: uuidPk(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ready: boolean("ready").notNull().default(false),
    isHost: boolean("is_host").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    index("room_players_room_id_idx").on(table.roomId),
    index("room_players_user_id_idx").on(table.userId),
    uniqueIndex("room_players_room_user_unique").on(table.roomId, table.userId),
  ],
);

export type RoomPlayer = typeof roomPlayers.$inferSelect;
export type NewRoomPlayer = typeof roomPlayers.$inferInsert;
