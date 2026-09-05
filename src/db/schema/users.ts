import { index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps, uuidPk } from "./shared";

/**
 * A registered player account (authentication/identity boundary).
 *
 * `passwordHash` is nullable to allow a future OAuth-only path; for the
 * credentials flow it is always populated by the auth service. It is never
 * returned to the client.
 */
export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    ...timestamps(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
