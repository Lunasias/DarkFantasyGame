import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgMemPool } from "@/db/pg-mem-pool";
import type { Pool } from "pg";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const R1 = "00000000-0000-0000-0000-000000000010";
const R2 = "00000000-0000-0000-0000-000000000011";
const MISSING = "00000000-0000-0000-0000-999999999999";

let pool: Pool;

beforeAll(async () => {
  const handle = await createPgMemPool();
  pool = handle.pool;
});

afterAll(async () => {
  try {
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  } catch {
    // ignore
  }
});

function q(text: string, values?: unknown[]) {
  return (pool as unknown as { query: (t: string, v?: unknown[]) => Promise<unknown> }).query(text, values);
}

describe("database constraints (generated schema, raw SQL)", () => {
  it("enforces a unique room_code", async () => {
    await q(`INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)`, [A, "a@x.com", "A"]);
    await q(`INSERT INTO rooms (id, room_code, name, host_user_id, status, max_players) VALUES ($1,$2,$3,$4,'waiting',4)`, [R1, "CODE1", "R", A]);
    await expect(
      q(`INSERT INTO rooms (id, room_code, name, host_user_id, status, max_players) VALUES ($1,$2,$3,$4,'waiting',4)`, [R2, "CODE1", "R2", A]),
    ).rejects.toThrow();
  });

  it("enforces the unique (room_id, user_id) membership constraint", async () => {
    const M1 = "00000000-0000-0000-0000-000000000021";
    const M2 = "00000000-0000-0000-0000-000000000022";
    await q(`INSERT INTO room_players (id, room_id, user_id, slot, ready, is_host, connected) VALUES ($1,$2,$3,$4,false,false,true)`, [M1, R1, A, 1]);
    await expect(
      q(`INSERT INTO room_players (id, room_id, user_id, slot, ready, is_host, connected) VALUES ($1,$2,$3,$4,false,false,true)`, [M2, R1, A, 2]),
    ).rejects.toThrow();
  });

  it("enforces the unique (room_id, slot) constraint", async () => {
    await q(`INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)`, [B, "b@x.com", "B"]);
    const M3 = "00000000-0000-0000-0000-000000000023";
    await expect(
      q(`INSERT INTO room_players (id, room_id, user_id, slot, ready, is_host, connected) VALUES ($1,$2,$3,$4,false,false,true)`, [M3, R1, B, 1]),
    ).rejects.toThrow();
  });

  it("enforces foreign keys", async () => {
    const M4 = "00000000-0000-0000-0000-000000000024";
    await expect(
      q(`INSERT INTO room_players (id, room_id, user_id, slot, ready, is_host, connected) VALUES ($1,$2,$3,$4,false,false,true)`, [M4, MISSING, A, 5]),
    ).rejects.toThrow();
  });

  it("enforces a unique user email", async () => {
    await expect(
      q(`INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)`, [C, "a@x.com", "C"]),
    ).rejects.toThrow();
  });
});
