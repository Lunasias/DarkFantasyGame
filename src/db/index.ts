import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Lazy singleton Drizzle client for Neon PostgreSQL.
 *
 * The client is created on first use and cached. It is only ever imported from
 * server-side code (route handlers / server actions / node scripts), never from
 * client components, so the serverless driver never leaks into the browser
 * bundle.
 */
let client: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return drizzle(neon(url), { schema });
}

export function getDb() {
  if (!client) {
    client = createDb();
  }
  return client;
}

export { schema };
