import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { rooms } from "./rooms";
import { uuidPk } from "./shared";
import { users } from "./users";

/**
 * Append-only, per-room event stream used to drive realtime updates and
 * reconnect replay. Sequence numbers are server-assigned and unique per room, so
 * clients can request "everything since N" without trusting a client-supplied
 * sequence.
 */
export const roomEvents = pgTable(
  "room_events",
  {
    id: uuidPk(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    sequence: integer("sequence").notNull().default(0),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("room_events_room_id_idx").on(table.roomId),
    uniqueIndex("room_events_room_sequence_unique").on(
      table.roomId,
      table.sequence,
    ),
  ],
);

export type RoomEvent = typeof roomEvents.$inferSelect;
export type NewRoomEvent = typeof roomEvents.$inferInsert;
