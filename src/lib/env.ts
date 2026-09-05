import { z } from "zod";

/**
 * Environment variable validation.
 *
 * All values are optional at boot: the DB is only needed when a server route
 * actually queries it, and the app URL has a sane default. This keeps `next
 * build` and Vitest green without a live Neon instance (see `.env.example`).
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validate a process-env source. Throws only when a value is malformed. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return result.data;
}

/** Convenience, lazily-evaluated accessors for server-side code. */
export const env = {
  get databaseUrl(): string | undefined {
    return process.env.DATABASE_URL;
  },
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
};
