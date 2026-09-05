import { index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps, uuidPk } from "./shared";

/** A registered player account (authentication/identity boundary). */
export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    email: text("email").notNull().unique(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    ...timestamps(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
