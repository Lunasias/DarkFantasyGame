import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { users } from "@/db/schema/users";
import { sessions } from "@/db/schema/sessions";
import { rooms } from "@/db/schema/rooms";
import { gameSessions } from "@/db/schema/game-sessions";
import { turns } from "@/db/schema/turns";
import { gameEvents } from "@/db/schema/game-events";
import { roomEvents } from "@/db/schema/room-events";
import { AuthService } from "@/lib/auth/auth-service";
import { RoomAppService } from "@/server/room/room-app-service";
import { InMemoryRealtimeTransport } from "@/server/realtime/in-memory";
import { createRateLimiter } from "@/server/rate-limit/rate-limiter";
import { TurnEngine, createRng, createCharacter, MovementEngine } from "@/game/engine";
import { persistTurn } from "@/db/turn-store";
import { assignJob, combatantFor } from "@/game/jobs";
import { addExperience } from "@/game/progression";
import { addGold, buyItem, sellItem } from "@/game/economy";
import { addItem, equip, getQuantity } from "@/game/items";
import { RewardService } from "@/game/rewards";
import { Board, BoardEngine, BoardNode } from "@/game/board";
import { CombatEngine, Combatant } from "@/game/combat";
import { getGameSnapshot } from "@/server/game/game-state";

const ENABLED = !!process.env.DATABASE_URL && !process.env.CI;

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let auth: AuthService;
let roomsSvc: RoomAppService;
let realtime: InMemoryRealtimeTransport;
const testEmails: string[] = [];
const sessionIds: string[] = [];

function stripUnsupported(url: string): string {
  return url.replace("&channel_binding=require", "");
}

async function register(unique: string) {
  const email = `live_${unique}@x.com`;
  testEmails.push(email);
  const res = await auth.register({
    email,
    password: "livePassword123",
    displayName: `Live-${unique}`,
  });
  return { user: res.user, token: res.token, email };
}

describe.runIf(ENABLED)("live integration (real Neon)", () => {
  beforeAll(async () => {
    const url = stripUnsupported(process.env.DATABASE_URL as string);
    pool = new Pool({ connectionString: url, max: 5 });
    db = drizzle(pool, { schema });
    auth = new AuthService(db, createRateLimiter());
    realtime = new InMemoryRealtimeTransport();
    roomsSvc = new RoomAppService(db, realtime, createRateLimiter());
  });

  afterAll(async () => {
    if (db) {
      for (const id of sessionIds) {
        await db.delete(gameSessions).where(eq(gameSessions.id, id));
      }
      if (testEmails.length) {
        await db.delete(users).where(like(users.email, "live_%"));
      }
    }
    await pool?.end?.();
  }, 30000);

  describe("auth against real Neon", () => {
    it("registers, persists hash, logs in, validates, and revokes", async () => {
      const { user, email } = await register("auth");

      const userRow = await db.select().from(users).where(eq(users.email, email)).limit(1);
      expect(userRow).toHaveLength(1);
      expect(userRow[0]?.passwordHash).toBeTruthy();
      expect(userRow[0]?.passwordHash).not.toContain("livePassword123");

      const login = await auth.login(email, "livePassword123");
      expect(login.user.id).toBe(userRow[0]?.id);
      expect(login.token).toBeTruthy();

      const sessionRows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(sessionRows.length).toBeGreaterThanOrEqual(1);

      expect((await auth.validate(login.token))?.id).toBe(user.id);
      await auth.logout(login.token);
      expect(await auth.validate(login.token)).toBeNull();
    });
  });

  describe("multiplayer room against real Neon", () => {
    it("creates a room, joins players, and enforces authorization", async () => {
      const a = await register("room_a");
      const b = await register("room_b");
      const c = await register("room_c");

      const room = await roomsSvc.createRoom(a.user, { name: "Live Room", maxPlayers: 4 });
      expect(room.code).toHaveLength(6);
      expect(room.hostId).toBe(a.user.id);
      expect(room.players).toHaveLength(1);

      await roomsSvc.joinRoom(b.user, { roomCode: room.code });
      await roomsSvc.joinRoom(c.user, { roomCode: room.code });
      const joined = await roomsSvc.getRoom(a.user, { roomId: room.id });
      expect(joined.players).toHaveLength(3);
      expect(joined.players.map((p) => p.slot).sort()).toEqual([0, 1, 2]);

      // duplicate join is idempotent
      await roomsSvc.joinRoom(b.user, { roomCode: room.code });
      expect((await roomsSvc.getRoom(a.user, { roomId: room.id })).players).toHaveLength(3);

      // invalid code
      await expect(roomsSvc.joinRoom(b.user, { roomCode: "NOPE99" })).rejects.toThrow();

      // non-member IDOR
      const d = await register("room_d");
      await expect(roomsSvc.getRoom(d.user, { roomId: room.id })).rejects.toThrow();

      // non-host start rejected
      await expect(roomsSvc.startGame(b.user, { roomId: room.id })).rejects.toThrow();

      await roomsSvc.setReady(a.user, { roomId: room.id, ready: true });
      await roomsSvc.setReady(b.user, { roomId: room.id, ready: true });
      await roomsSvc.setReady(c.user, { roomId: room.id, ready: true });
      const started = await roomsSvc.startGame(a.user, { roomId: room.id });
      expect(started.gameSessionId).toBeTruthy();
      sessionIds.push(started.gameSessionId);

      const s = await db.select().from(gameSessions).where(eq(gameSessions.id, started.gameSessionId)).limit(1);
      // Session is created in 'lobby' and becomes 'active' once the first turn
      // is persisted (see the turn test).
      expect(s[0]?.phase).toBe("lobby");
      const roomRow = await db.select().from(rooms).where(eq(rooms.id, room.id)).limit(1);
      expect(roomRow[0]?.status).toBe("in_game");
      const ev = await db.select().from(roomEvents).where(eq(roomEvents.roomId, room.id));
      expect(ev.some((e) => e.type === "GAME_STARTED")).toBe(true);
    }, 30000);
  });

  describe("turn persistence against real Neon", () => {
    it("persists turns and game_events with state_version + sequences", async () => {
      const a = await register("turn_a");
      const b = await register("turn_b");
      const room = await roomsSvc.createRoom(a.user, { name: "Turn Room", maxPlayers: 2 });
      await roomsSvc.joinRoom(b.user, { roomCode: room.code });
      await roomsSvc.setReady(a.user, { roomId: room.id, ready: true });
      await roomsSvc.setReady(b.user, { roomId: room.id, ready: true });
      const started = await roomsSvc.startGame(a.user, { roomId: room.id });
      sessionIds.push(started.gameSessionId);

      const engine = new TurnEngine(started.gameSessionId, [a.user.id, b.user.id], {
        now: () => 0,
        rng: createRng(42),
      });
      engine.start();
      const res = engine.submitAction({ type: "end_turn", playerId: a.user.id });
      await persistTurn(db, {
        gameSessionId: started.gameSessionId,
        playerId: res.playerId,
        turn: res.turn,
        stateVersion: res.stateVersion,
        result: res.result,
        events: engine.eventLog,
      });

      const t = await db.select().from(turns).where(eq(turns.gameSessionId, started.gameSessionId));
      expect(t).toHaveLength(1);
      expect(t[0]?.turnNumber).toBe(1);
      const gs = await db.select().from(gameSessions).where(eq(gameSessions.id, started.gameSessionId)).limit(1);
      expect(gs[0]?.phase).toBe("active");
      expect(gs[0]?.stateVersion).toBe(res.stateVersion);
      expect(gs[0]?.currentTurnNumber).toBe(1);
      const ge = await db.select().from(gameEvents).where(eq(gameEvents.gameSessionId, started.gameSessionId));
      expect(ge.length).toBeGreaterThan(0);
      const seqs = ge.map((e) => e.sequence);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }, 30000);
  });

  describe("in-memory game domains (documented as not yet persisted)", () => {
    it("movement is authoritative; client cannot override", () => {
      const board = new Board();
      board.addNode(new BoardNode({ id: "A", kind: "start" }));
      board.addNode(new BoardNode({ id: "B" }));
      board.connect("A", "B");
      const be = new BoardEngine(board);
      be.place("p1", "A");
      const te = new TurnEngine("s", ["p1", "p2"], { now: () => 0, rng: createRng(1) });
      const me = new MovementEngine(te, be, { rng: createRng(1) });
      me.start();
      const dice = me.rollDice();
      expect(dice).toBeGreaterThanOrEqual(1);
      expect(me.reachableDestinations()).toContain("B");
      expect(me.move("B").toNodeId).toBe("B");
      expect(be.getPosition("p1")).toBe("B");
      expect(() => me.move("nope")).toThrow();
    });

    it("combat, character progression, shop, and reward domains are authoritative", () => {
      const combat = new CombatEngine([
        new Combatant("a", { maxHealth: 100, attack: 15, defense: 5 }),
        new Combatant("b", { maxHealth: 10, attack: 10, defense: 5 }),
      ], { now: () => 0 });
      combat.attack("a", "b");
      expect(combat.winner).toBe("a");
      expect(combat.statusValue).toBe("completed");

      const ch = createCharacter({ name: "V", archetype: "a" });
      assignJob(ch, "knight");
      addExperience(ch, 300);
      addGold(ch, 500);
      addItem(ch, "grave_dust", 3);
      addItem(ch, "iron_longsword", 1);
      equip(ch, "iron_longsword");
      expect(getQuantity(ch, "grave_dust")).toBe(3);
      expect(combatantFor(ch).maxHealth).toBeGreaterThan(100);

      const c2 = createCharacter({ name: "S", archetype: "a" });
      addGold(c2, 1000);
      buyItem(c2, "black_ash_general", "grave_dust", 2);
      expect(getQuantity(c2, "grave_dust")).toBe(2);
      sellItem(c2, "black_ash_general", "grave_dust", 1);
      expect(getQuantity(c2, "grave_dust")).toBe(1);

      const rs = new RewardService(createRng(7));
      const r = createCharacter({ name: "R", archetype: "a" });
      const reward = { id: "r", experience: 100, gold: 50, itemDrops: [{ itemId: "grave_dust", quantity: 1, chance: 1 }] };
      rs.grantVictoryReward(r, reward, { combatId: "c1", winnerId: r.id });
      const again = rs.grantVictoryReward(r, reward, { combatId: "c1", winnerId: r.id });
      expect(again.alreadyClaimed).toBe(true);
      expect(r.experience).toBe(100);
      expect(r.gold).toBe(150);
      expect(getQuantity(r, "grave_dust")).toBe(1);
    });
  });

  describe("database concurrency (limited)", () => {
    it("two simultaneous joins for the same user keep a single membership", async () => {
      const a = await register("conc_a");
      const b = await register("conc_b");
      const room = await roomsSvc.createRoom(a.user, { name: "Conc", maxPlayers: 4 });
      await Promise.allSettled([
        roomsSvc.joinRoom(b.user, { roomCode: room.code }),
        roomsSvc.joinRoom(b.user, { roomCode: room.code }),
      ]);
      const joined = await roomsSvc.getRoom(a.user, { roomId: room.id });
      expect(joined.players.filter((p) => p.userId === b.user.id)).toHaveLength(1);
      // room never exceeds max (only 2 members total)
      expect(joined.players.length).toBeLessThanOrEqual(room.maxPlayers);
    }, 30000);
    // NOTE: shop buy/sell and reward claims are domain-level (in-memory) and are
    // not DB-backed yet, so TRUE concurrent transaction tests for those could not
    // be performed against Neon — documented, not claimed.
  });

  describe("resume flow", () => {
    it("loads an authoritative snapshot for a member and rejects a non-member", async () => {
      const a = await register("resume_a");
      const b = await register("resume_b");
      const room = await roomsSvc.createRoom(a.user, { name: "Resume", maxPlayers: 2 });
      await roomsSvc.joinRoom(b.user, { roomCode: room.code });
      await roomsSvc.setReady(a.user, { roomId: room.id, ready: true });
      await roomsSvc.setReady(b.user, { roomId: room.id, ready: true });
      const started = await roomsSvc.startGame(a.user, { roomId: room.id });
      sessionIds.push(started.gameSessionId);

      const snap = await getGameSnapshot(db, a.user.id, started.gameSessionId);
      expect(snap.sessionId).toBe(started.gameSessionId);
      expect(snap.stateVersion).toBe(0);
      expect(snap.phase).toBe("lobby");
      expect(snap.roomCode).toBe(room.code);

      const outsider = await register("resume_out");
      await expect(getGameSnapshot(db, outsider.user.id, started.gameSessionId)).rejects.toThrow();
    }, 30000);
  });

  describe("schema tables present", () => {
    it("contains all expected tables", async () => {
      const rows = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
      const names = rows.rows.map((r: { tablename: string }) => r.tablename);
      for (const t of ["users", "sessions", "rooms", "items", "character_inventory", "shops", "shop_inventory", "reward_claims", "turns", "game_events"]) {
        expect(names).toContain(t);
      }
    });
  });
});
