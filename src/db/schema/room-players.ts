import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { playerProfiles } from "./player-profiles";
import { rooms } from "./rooms";
import { timestamps, uuidPk } from "./shared";
import { users } from "./users";

/**
 * Join table: which players are seated in a room.
 *
 * - `slot` is the server-allocated seat index (never client-supplied).
 * - `connected`/`last_seen_at` feed the reconnect foundation.
 * - `profile_id` optionally links the seat to a real player profile/character.
 *
 * The unique (room_id, user_id) constraint is the anti-duplicate-join guard and
 * the (room_id, slot) constraint prevents slot collision even under contention.
 */
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
    profileId: uuid("profile_id").references(() => playerProfiles.id, {
      onDelete: "set null",
    }),
    slot: integer("slot").notNull(),
    ready: boolean("ready").notNull().default(false),
    isHost: boolean("is_host").notNull().default(false),
    connected: boolean("connected").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    index("room_players_room_id_idx").on(table.roomId),
    index("room_players_user_id_idx").on(table.userId),
    uniqueIndex("room_players_room_user_unique").on(table.roomId, table.userId),
    uniqueIndex("room_players_room_slot_unique").on(table.roomId, table.slot),
  ],
);

export type RoomPlayer = typeof roomPlayers.$inferSelect;
export type NewRoomPlayer = typeof roomPlayers.$inferInsert;
