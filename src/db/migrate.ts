import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal query runner so migration logic works with `pg` and pg-mem pools. */
export interface SqlRunner {
  query(text: string): Promise<unknown>;
}

/** Apply a single SQL file (the `--> statement-breakpoint` format Drizzle emits). */
export async function applySqlFile(
  runner: SqlRunner,
  filePath: string,
): Promise<void> {
  const sql = readFileSync(filePath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await runner.query(statement);
  }
}

/**
 * Apply every generated migration SQL file, in order, to the given runner.
 * This is used for the local/in-memory dev database and tests.
 */
export async function applyMigrations(
  runner: SqlRunner,
  migrationsDir = "drizzle",
): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await applySqlFile(runner, join(migrationsDir, file));
  }
}
