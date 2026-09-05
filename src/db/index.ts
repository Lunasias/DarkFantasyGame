import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** The Drizzle database type used across the app, repositories, and tests. */
export type Db = NodePgDatabase<typeof schema>;

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

interface PoolHandle {
  pool: Pool;
  close(): Promise<void>;
}

let state: { db: Db; close: () => Promise<void> } | null = null;

async function createPool(url: string): Promise<PoolHandle> {
  const pool = new Pool({ connectionString: url, max: 10 });
  return { pool, close: () => pool.end() };
}

/**
 * Lazy singleton Drizzle client for Neon PostgreSQL.
 *
 * The database is only reachable when `DATABASE_URL` is set (production /
 * Neon). Without it, server code that touches the database throws a clear
 * error rather than silently degrading — the app still serves static pages and
 * the Auth UI. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to
 * enable auth + rooms.
 */
export async function getDb(): Promise<Db> {
  if (!state) {
    const url = databaseUrl();
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and set DATABASE_URL to your Neon connection string.",
      );
    }
    const handle = await createPool(url);
    state = { db: drizzle(handle.pool, { schema }), close: handle.close };
  }
  return state.db;
}

/** Close and reset the singleton (used in tests and teardown). */
export async function closeDb(): Promise<void> {
  if (state) {
    await state.close();
    state = null;
  }
}

export { schema };
