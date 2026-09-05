import {
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { roomStatusEnum } from "./enums";
import { timestamps, uuidPk } from "./shared";
import { users } from "./users";

/** A pre-game lobby (matching the `Room` domain object). */
export const rooms = pgTable(
  "rooms",
  {
    id: uuidPk(),
    name: text("name").notNull(),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: roomStatusEnum("status").notNull().default("waiting"),
    maxPlayers: integer("max_players").notNull().default(4),
    ...timestamps(),
  },
  (table) => [index("rooms_host_user_id_idx").on(table.hostUserId)],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
