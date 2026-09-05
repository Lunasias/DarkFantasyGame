import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps, uuidPk } from "./shared";
import { users } from "./users";

/**
 * Server-side auth sessions. Only a SHA-256 hash of the session token is
 * stored, never the token itself, so a database leak cannot be replayed as a
 * session cookie.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ...timestamps(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
