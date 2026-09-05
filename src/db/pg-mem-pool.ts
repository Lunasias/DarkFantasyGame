import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DataType, newDb } from "pg-mem";
import type { Pool } from "pg";

export interface MemPool {
  pool: Pool;
  close(): Promise<void>;
}

interface PgQueryConfig {
  text: string;
  values?: unknown[];
  types?: { getTypeParser?: unknown };
}

/**
 * Create an in-memory Postgres (pg-mem) pool that Drizzle's node-postgres
 * driver can use over it.
 *
 * pg-mem throws when a query config carries a `types` object with
 * `getTypeParser` (which Drizzle attaches). We strip that field before the query
 * reaches pg-mem so Drizzle's driver works while pg-mem supplies its own default
 * value decoding.
 */
export async function createPgMemPool(): Promise<MemPool> {
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Pool;
  patchQuery(pool);

  // Bootstrap the schema from the committed baseline snapshot of the current
  // schema. pg-mem cannot replay Drizzle's incremental ALTER migrations
  // (e.g. enum `SET DATA TYPE ... USING`), so we apply the full current DDL.
  const schemaPath = resolve(process.cwd(), "src/db/schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await (pool as unknown as { query: (t: string) => Promise<unknown> }).query(statement);
  }

  return { pool, close: async () => undefined };
}

function patchQuery(pool: Pool): void {
  const anyPool = pool as unknown as {
    query: (...args: unknown[]) => unknown;
  };
  const originalQuery = anyPool.query.bind(anyPool);
  anyPool.query = (config: unknown, ...rest: unknown[]) => {
    if (config && typeof config === "object") {
      const withTypes = config as PgQueryConfig;
      if ("types" in withTypes) {
        const stripped: PgQueryConfig = { text: withTypes.text, values: withTypes.values };
        return originalQuery(stripped, ...rest);
      }
    }
    return originalQuery(config, ...rest);
  };
}
