import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, like } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { users } from "@/db/schema/users";
import { playerProfiles } from "@/db/schema/player-profiles";
import { characters } from "@/db/schema/characters";
import { gameSessions } from "@/db/schema/game-sessions";
import { rooms } from "@/db/schema/rooms";
import { roomPlayers } from "@/db/schema/room-players";
import { items } from "@/db/schema/items";
import { boardPositions } from "@/db/schema/board-positions";
import { combats } from "@/db/schema/combats";
import { combatParticipants } from "@/db/schema/combat-participants";
import { rewardClaims } from "@/db/schema/reward-claims";
import { monsterParticipantId } from "@/game/content";
import { createId } from "@/game/engine/id";
import { createRng } from "@/game/engine/rng";
import {
  acceptQuest,
  completeQuest,
  completeDungeon,
  enterDungeon,
  resolveWorldEvent,
  syncQuestProgress,
  getCharacterContentState,
} from "@/db/content-store";
import { GameplayService } from "@/server/game/gameplay";
import { getGameSnapshot } from "@/server/game/game-state";

const ENABLED = !!process.env.DATABASE_URL && !process.env.CI;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
const testEmails: string[] = [];
const sessionIds: string[] = [];
const seededItems = ["grave_dust"];

function strip(url: string) {
  return url.replace("&channel_binding=require", "");
}

async function createChar(unique: string) {
  const email = `live_p19_${unique}@x.com`;
  testEmails.push(email);
  const userId = createId();
  const profileId = createId();
  const id = createId();
  await db.insert(users).values({ id: userId, email, displayName: unique });
  await db.insert(playerProfiles).values({ id: profileId, userId, playerName: unique, level: 1, totalGold: 0 });
  await db.insert(characters).values({ id, profileId, name: unique, archetype: "adventurer", level: 1, experience: 0, gold: 100, health: 100, maxHealth: 100 });
  return { userId, profileId, characterId: id };
}

/** Create an in-game room + session with two members at the given turns. */
async function setupSession(host: { userId: string }, guest: { userId: string }, turn = 1) {
  const roomId = createId();
  const sessionId = createId();
  sessionIds.push(sessionId);
  await db.insert(rooms).values({ id: roomId, roomCode: `P19${createId().slice(0, 4)}`, name: "P19", hostUserId: host.userId, status: "in_game", maxPlayers: 4 });
  await db.insert(roomPlayers).values({ id: createId(), roomId, userId: host.userId, slot: 0, ready: true, isHost: true, connected: true });
  await db.insert(roomPlayers).values({ id: createId(), roomId, userId: guest.userId, slot: 1, ready: true, isHost: false, connected: true });
  await db.insert(gameSessions).values({ id: sessionId, roomId, phase: "active", currentTurnNumber: turn, stateVersion: 0 });
  return { roomId, sessionId };
}

/** Place a character at a board node within a session. */
async function placeAt(sessionId: string, characterId: string, nodeId: string) {
  await db.insert(boardPositions).values({ id: createId(), gameSessionId: sessionId, characterId, nodeId })
    .onConflictDoUpdate({ target: [boardPositions.gameSessionId, boardPositions.characterId], set: { nodeId } });
}

/** Record a combat won by `winner` so the defeat objective derives progress. */
async function recordWin(characterId: string) {
  const sessionId = createId();
  sessionIds.push(sessionId);
  await db.insert(gameSessions).values({ id: sessionId, roomId: null, phase: "active", currentTurnNumber: 0, stateVersion: 0 });
  await db.insert(combats).values({ id: createId(), gameSessionId: sessionId, status: "completed", winner: characterId, activeCombatant: null, combatTurn: 0, stateVersion: 1 });
}

describe.runIf(ENABLED)("Phase 19 content persistence (real Neon)", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: strip(process.env.DATABASE_URL as string), max: 6 });
    db = drizzle(pool, { schema });
    await db.insert(items).values({ id: "grave_dust", name: "Grave Dust", description: "d", category: "material", stackable: true });
  });

  afterAll(async () => {
    if (db) {
      if (sessionIds.length) await db.delete(gameSessions).where(eq(gameSessions.id, sessionIds[0]));
      if (testEmails.length) await db.delete(users).where(like(users.email, "live_p19_%"));
      for (const id of seededItems) await db.delete(items).where(eq(items.id, id));
    }
    await pool?.end?.();
  }, 30000);

  it("persists quest acceptance, progress, and content snapshot state", async () => {
    const { characterId } = await createChar("accept");
    await acceptQuest(db, { characterId, questId: "reach_the_village" });
    const state = await getCharacterContentState(db, characterId);
    expect(state.quests).toHaveLength(1);
    expect(state.quests[0].status).toBe("accepted");
    // accepts are idempotent
    const again = await acceptQuest(db, { characterId, questId: "reach_the_village" });
    expect(again.accepted).toBe(false);
  }, 30000);

  it("derives objective progress from authoritative sources and completes exactly once", async () => {
    const { characterId } = await createChar("derive");
    await acceptQuest(db, { characterId, questId: "first_blood" });
    await recordWin(characterId); // one defeat >= objective amount 1
    // Reach-objective quest: place character at node C
    await acceptQuest(db, { characterId, questId: "reach_the_village" });

    const cmp = await completeQuest(db, { characterId, questId: "first_blood", nodeId: "A", rng: createRng(1) });
    expect(cmp.met).toBe(true);
    expect(cmp.reward.alreadyClaimed).toBe(false);
    expect(cmp.reward.experienceGranted).toBe(100);
    // completing again is rejected (durable state)
    await expect(completeQuest(db, { characterId, questId: "first_blood", nodeId: "A" })).rejects.toThrow();
  }, 30000);

  it("rejects completing an unaccepted or unmet quest", async () => {
    const { characterId } = await createChar("unmet");
    await expect(completeQuest(db, { characterId, questId: "reach_the_village", nodeId: "A" })).rejects.toThrow(); // not accepted
    await acceptQuest(db, { characterId, questId: "reach_the_village" });
    await expect(completeQuest(db, { characterId, questId: "reach_the_village", nodeId: "A" })).rejects.toThrow(); // not at node C
  }, 30000);

  it("resolves a world event once (success) and rejects a re-roll", async () => {
    const { characterId } = await createChar("event");
    // cursed_shrine is on node B. Content-store validates position from the nodeId
    // supplied by the server (never the client); directly resolve with nodeId B.
    const out = await resolveWorldEvent(db, { characterId, eventId: "cursed_shrine", nodeId: "B", rng: createRng(1) });
    expect(["success", "missed"]).toContain(out.outcome);
    // The claim is durable: a second resolve is always rejected regardless of outcome.
    await expect(resolveWorldEvent(db, { characterId, eventId: "cursed_shrine", nodeId: "B", rng: createRng(2) })).rejects.toThrow();
    // Wrong node rejected.
    await expect(resolveWorldEvent(db, { characterId, eventId: "cursed_shrine", nodeId: "E" })).rejects.toThrow();
  }, 30000);

  it("enters + clears a dungeon once and rejects duplicate clearance", async () => {
    const { characterId } = await createChar("dungeon");
    await enterDungeon(db, { characterId, dungeonId: "crypt_of_ash", nodeId: "D" });
    const cmp = await completeDungeon(db, { characterId, dungeonId: "crypt_of_ash", rng: createRng(5) });
    expect(cmp.reward.alreadyClaimed).toBe(false);
    expect(cmp.reward.experienceGranted).toBe(300);
    const state = await getCharacterContentState(db, characterId);
    expect(state.dungeons[0].status).toBe("completed");
    await expect(completeDungeon(db, { characterId, dungeonId: "crypt_of_ash" })).rejects.toThrow();
    // entering at a wrong node is rejected
    await expect(enterDungeon(db, { characterId, dungeonId: "crypt_of_ash", nodeId: "B" })).rejects.toThrow();
  }, 30000);

  it("concurrent identical quest completions grant exactly one reward", async () => {
    const { characterId } = await createChar("cc");
    await acceptQuest(db, { characterId, questId: "first_blood" });
    await recordWin(characterId);
    const [a, b] = await Promise.allSettled([
      completeQuest(db, { characterId, questId: "first_blood", nodeId: "A", rng: createRng(1) }),
      completeQuest(db, { characterId, questId: "first_blood", nodeId: "A", rng: createRng(2) }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const granted = fulfilled.filter((r) => r.status === "fulfilled" && r.value.reward && !r.value.reward.alreadyClaimed);
    expect(granted.length).toBe(1);
    const row = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
    expect(row[0]?.experience).toBe(100);
    // exactly one reward_claim (single EXP grant)
  }, 30000);

  it("syncQuestProgress is durable and replays idempotently", async () => {
    const { characterId } = await createChar("sync");
    await acceptQuest(db, { characterId, questId: "reach_the_village" });
    const s1 = await syncQuestProgress(db, { characterId, questId: "reach_the_village", nodeId: "C" });
    expect(s1.met).toBe(true);
    const s2 = await syncQuestProgress(db, { characterId, questId: "reach_the_village", nodeId: "C" });
    expect(s2.progress.reach).toBe(1);
  }, 30000);

  describe("authorization / IDOR through GameplayService", () => {
    it("rejects non-member session access and wrong-owner actions", async () => {
      const host = await createChar("sec_host");
      const guest = await createChar("sec_guest");
      const outsider = await createChar("sec_out");
      const { sessionId } = await setupSession(host, guest);

      const svc = new GameplayService(db);
      // non-member -> session membership denied
      await expect(svc.acceptQuest(outsider.userId, sessionId, host.characterId, "first_blood")).rejects.toThrow();
      // wrong owner: guest acting on host's character (guest IS a member but does not own host char)
      await expect(svc.acceptQuest(guest.userId, sessionId, host.characterId, "first_blood")).rejects.toThrow();
      // owner success
      const res = await svc.acceptQuest(host.userId, sessionId, host.characterId, "first_blood");
      expect(res.accepted).toBe(true);
    }, 30000);

    it("validates town node and dungeon entry node against authoritative position", async () => {
      const host = await createChar("town_host");
      const guest = await createChar("town_guest");
      const { sessionId } = await setupSession(host, guest);
      await placeAt(sessionId, host.characterId, "B"); // host at B

      const svc = new GameplayService(db);
      // ashenfall town is at node C; reject at B
      await expect(svc.enterTown(host.userId, sessionId, host.characterId, "ashenfall")).rejects.toThrow();
      // move to C then succeed
      await placeAt(sessionId, host.characterId, "C");
      const town = await svc.enterTown(host.userId, sessionId, host.characterId, "ashenfall");
      expect(town.townId).toBe("ashenfall");
      // dungeon crypt_of_ash is at D; reject at C, succeed at D
      await expect(svc.enterDungeon(host.userId, sessionId, host.characterId, "crypt_of_ash")).rejects.toThrow();
      await placeAt(sessionId, host.characterId, "D");
      const entered = await svc.enterDungeon(host.userId, sessionId, host.characterId, "crypt_of_ash");
      expect(entered.entered).toBe(true);
    }, 30000);

    it("exposes a complete snapshot with content and rejects a non-member", async () => {
      const host = await createChar("snap_host");
      const guest = await createChar("snap_guest");
      const outsider = await createChar("snap_out");
      const { sessionId } = await setupSession(host, guest);
      await acceptQuest(db, { characterId: host.characterId, questId: "first_blood" });

      const snap = await getGameSnapshot(db, host.userId, sessionId);
      expect(snap.content).toBeTruthy();
      expect(snap.content[host.characterId]).toBeTruthy();
      expect(snap.content[host.characterId].quests[0].questId).toBe("first_blood");
      await expect(getGameSnapshot(db, outsider.userId, sessionId)).rejects.toThrow();
    }, 30000);
  });

  describe("PvE encounter (real Neon)", () => {
    it("starts a PvE combat, persists it, and grants exactly-once reward on victory", async () => {
      const host = await createChar("pve_host");
      const guest = await createChar("pve_guest");
      const outsider = await createChar("pve_out");
      const { sessionId } = await setupSession(host, guest, 2);
      const svc = new GameplayService(db);
      const monsterId = "ash_skeleton";
      const mPid = monsterParticipantId(monsterId);

      // Place the challenger on the encounter node (B).
      await placeAt(sessionId, host.characterId, "B");

      // Invalid starts: wrong node (not on encounter), non-member, non-owner.
      await expect(svc.startEncounter(outsider.userId, sessionId, host.characterId)).rejects.toThrow(); // non-member
      await expect(svc.startEncounter(guest.userId, sessionId, host.characterId)).rejects.toThrow(); // wrong owner
      await placeAt(sessionId, host.characterId, "C");
      await expect(svc.startEncounter(host.userId, sessionId, host.characterId)).rejects.toThrow(); // no encounter
      await placeAt(sessionId, host.characterId, "B");

      const started = await svc.startEncounter(host.userId, sessionId, host.characterId);
      expect(started.monster.id).toBe(monsterId);
      const combatRow = await db.select().from(combats).where(eq(combats.id, started.combatId)).limit(1);
      expect(combatRow[0]?.status).toBe("active");
      expect(combatRow[0]?.activeCombatant).toBe(host.characterId);

      const parts = await db.select().from(combatParticipants)
        .where(eq(combatParticipants.combatId, started.combatId));
      const hero = parts.find((p) => p.characterId === host.characterId);
      const monster = parts.find((p) => p.characterId === mPid);
      expect(hero).toBeTruthy();
      expect(monster).toBeTruthy();
      expect(hero?.maxHp).toBe(100);
      expect(monster?.hp).toBe(60);

      // A second start is rejected while combat is active.
      await expect(svc.startEncounter(host.userId, sessionId, host.characterId)).rejects.toThrow();

      // Force the monster to 1 HP so the challenger's next attack is the kill.
      await db.update(combatParticipants).set({ hp: 1 }).where(eq(combatParticipants.id, monster!.id));
      const attack = await svc.attack(host.userId, sessionId, host.characterId, mPid);
      expect(attack.defeated).toBe(true);
      expect(attack.victory).toBe(true);
      expect(attack.winner).toBe(host.characterId);
      expect(attack.reward?.alreadyClaimed).toBe(false);

      const done = await db.select().from(combats).where(eq(combats.id, started.combatId)).limit(1);
      expect(done[0]?.status).toBe("completed");
      expect(done[0]?.winner).toBe(host.characterId);

      // Exactly one reward claim (PvE reward: exp 150 / gold 80).
      const claims = await db.select().from(rewardClaims)
        .where(eq(rewardClaims.characterId, host.characterId));
      const claim = claims.find((c) => c.rewardKey === `combat:${started.combatId}`);
      expect(claim).toBeTruthy();
      expect(claim?.experience).toBe(150);
      expect(claim?.gold).toBe(80);
      expect(claims.filter((c) => c.rewardKey === `combat:${started.combatId}`)).toHaveLength(1);

      // Completed combat rejects further attacks; snapshot reconstructs combat.
      await expect(svc.attack(host.userId, sessionId, host.characterId, mPid)).rejects.toThrow();
      const snap = await getGameSnapshot(db, host.userId, sessionId);
      expect(snap.combat?.status).toBe("completed");
      expect(snap.combat?.winner).toBe(host.characterId);
    }, 30000);
  });

  describe("PvE combat AI loop (real Neon)", () => {
    it("alternates player + monster turns until the player wins exactly once", async () => {
      const host = await createChar("ai_host");
      const guest = await createChar("ai_guest");
      const { sessionId } = await setupSession(host, guest, 2);
      const svc = new GameplayService(db);
      const mPid = monsterParticipantId("ash_skeleton");

      await placeAt(sessionId, host.characterId, "B");
      const started = await svc.startEncounter(host.userId, sessionId, host.characterId);

      // Weaken the monster so the loop resolves in a few rounds.
      await db.update(combatParticipants).set({ hp: 10 }).where(eq(combatParticipants.id, (
        (await db.select().from(combatParticipants).where(and(
          eq(combatParticipants.combatId, started.combatId),
          eq(combatParticipants.characterId, mPid),
        )).limit(1))[0])!.id));

      let wins = 0;
      for (let i = 0; i < 30; i++) {
        const r = await svc.attack(host.userId, sessionId, host.characterId, mPid);
        if (r.victory) { wins++; break; }
        // Each player action resolves one monster counter (player damage applied).
        expect(r.monsterTurn as { damage: number } | null).not.toBeNull();
      }
      expect(wins).toBe(1);

      const done = await db.select().from(combats).where(eq(combats.id, started.combatId)).limit(1);
      expect(done[0]?.status).toBe("completed");
      expect(done[0]?.winner).toBe(host.characterId);

      // Exactly one PvE reward claim.
      const claims = await db.select().from(rewardClaims).where(eq(rewardClaims.characterId, host.characterId));
      expect(claims.filter((c) => c.rewardKey === `combat:${started.combatId}`)).toHaveLength(1);
      expect(claims.find((c) => c.rewardKey === `combat:${started.combatId}`)?.experience).toBe(150);

      // Reconnect reconstructs completed combat.
      const snap = await getGameSnapshot(db, host.userId, sessionId);
      expect(snap.combat?.status).toBe("completed");
      expect(snap.combat?.winner).toBe(host.characterId);
      expect(snap.combat?.combatTurnType).toBe("completed");
    }, 30000);

    it("rejects a player attack during a monster turn (no double, no client damage)", async () => {
      const host = await createChar("turn_host");
      const guest = await createChar("turn_guest");
      const { sessionId } = await setupSession(host, guest, 2);
      const svc = new GameplayService(db);
      const mPid = monsterParticipantId("ash_skeleton");
      await placeAt(sessionId, host.characterId, "B");
      const started = await svc.startEncounter(host.userId, sessionId, host.characterId);

      // Force it to be the monster's turn.
      await db.update(combats).set({ activeCombatant: mPid }).where(eq(combats.id, started.combatId));
      // Player cannot attack on the monster's turn.
      await expect(svc.attack(host.userId, sessionId, host.characterId, mPid)).rejects.toThrow();
      // Second attack is still rejected (no double).
      await expect(svc.attack(host.userId, sessionId, host.characterId, mPid)).rejects.toThrow();

      // Resolve the monster turn once; a second resolution is rejected (idempotent).
      const once = await svc.resolveMonsterTurn(host.userId, sessionId);
      expect((once as { action: string }).action).toBe("attack");
      const playerPart = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, started.combatId),
        eq(combatParticipants.characterId, host.characterId),
      )).limit(1);
      expect(playerPart[0]!.hp).toBeLessThan(100);
      const hpAfter = playerPart[0]!.hp;
      await expect(svc.resolveMonsterTurn(host.userId, sessionId)).rejects.toThrow(); // player's turn now / not monster
      const playerPart2 = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, started.combatId),
        eq(combatParticipants.characterId, host.characterId),
      )).limit(1);
      expect(playerPart2[0]!.hp).toBe(hpAfter); // no duplicate damage
    }, 30000);

    it("completes defeat when the player reaches 0 HP, grants no reward", async () => {
      const host = await createChar("def_host");
      const guest = await createChar("def_guest");
      const outsider = await createChar("def_out");
      const { sessionId } = await setupSession(host, guest, 2);
      const svc = new GameplayService(db);
      const mPid = monsterParticipantId("ash_skeleton");
      await placeAt(sessionId, host.characterId, "B");
      const started = await svc.startEncounter(host.userId, sessionId, host.characterId);

      // Non-member cannot resolve a monster turn.
      await expect(svc.resolveMonsterTurn(outsider.userId, sessionId)).rejects.toThrow();

      // Set the player to 5 HP so the monster's first counter is lethal (7 dmg).
      const playerRow = (await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, started.combatId),
        eq(combatParticipants.characterId, host.characterId),
      )).limit(1))[0];
      await db.update(combatParticipants).set({ hp: 5 }).where(eq(combatParticipants.id, playerRow!.id));

      // Player attacks (monster survives), monster counter is lethal → defeat.
      const r = await svc.attack(host.userId, sessionId, host.characterId, mPid);
      expect(r.victory).toBe(false);
      const mTurn = r.monsterTurn as { defeated: boolean; winner: string | null; status: string };
      expect(mTurn.defeated).toBe(true);
      expect(mTurn.winner).toBe(mPid);
      expect(mTurn.status).toBe("completed");

      const done = await db.select().from(combats).where(eq(combats.id, started.combatId)).limit(1);
      expect(done[0]?.status).toBe("completed");
      expect(done[0]?.winner).toBe(mPid);
      const playerPart = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, started.combatId),
        eq(combatParticipants.characterId, host.characterId),
      )).limit(1);
      expect(playerPart[0]!.hp).toBe(0);
      expect(playerPart[0]!.alive).toBe(false);

      // No victory reward for the defeated player.
      const claims = await db.select().from(rewardClaims).where(eq(rewardClaims.characterId, host.characterId));
      expect(claims.filter((c) => c.rewardKey === `combat:${started.combatId}`)).toHaveLength(0);

      // Completed combat rejects further monster resolution + player attacks.
      await expect(svc.resolveMonsterTurn(host.userId, sessionId)).rejects.toThrow();
      await expect(svc.attack(host.userId, sessionId, host.characterId, mPid)).rejects.toThrow();

      // Reconnect reconstructs the defeat state.
      const snap = await getGameSnapshot(db, host.userId, sessionId);
      expect(snap.combat?.status).toBe("completed");
      expect(snap.combat?.winner).toBe(mPid);
      expect(snap.combat?.combatTurnType).toBe("completed");
      const defeated = snap.combat?.participants.find((p) => p.characterId === host.characterId);
      expect(defeated?.alive).toBe(false);
    }, 30000);
  });

  describe("Skills & mana (real Neon)", () => {
    async function startCombat(unique: string, mPid: string) {
      const host = await createChar(unique);
      const guest = await createChar(`${unique}_g`);
      const { sessionId } = await setupSession(host, guest, 2);
      const svc = new GameplayService(db);
      await placeAt(sessionId, host.characterId, "B");
      const started = await svc.startEncounter(host.userId, sessionId, host.characterId);
      return { host, guest, sessionId, svc, combatId: started.combatId, mPid };
    }

    it("power strike deducts mana, damages, and is blocked by cooldown (no double)", async () => {
      const mPid = monsterParticipantId("ash_skeleton");
      const { host, sessionId, svc, combatId } = await startCombat("sk1", mPid);
      // Reset monster HP so it survives a strike, then cooldown blocks a second.
      await db.update(combatParticipants).set({ hp: 60 }).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, mPid)));

      const r1 = await svc.useSkill(host.userId, sessionId, host.characterId, "power_strike", mPid);
      expect(r1.effect).toBe("damage");
      expect(r1.amount).toBe(14);
      expect(r1.mana).toBe(40);
      expect(r1.victory).toBe(false);
      const monsterRow = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, mPid))).limit(1);
      expect(monsterRow[0]!.hp).toBe(46); // 60 - 14
      const charRow = await db.select().from(characters).where(eq(characters.id, host.characterId)).limit(1);
      expect(charRow[0]!.mana).toBe(40);
      // Monster counter fired (player took damage) and player turn returned.
      expect(r1.monsterTurn as { defeated: boolean } | null).not.toBeNull();
      // Cooldown prevents immediate reuse (and no double damage/mana).
      await expect(svc.useSkill(host.userId, sessionId, host.characterId, "power_strike", mPid)).rejects.toThrow();
      const monsterRow2 = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, mPid))).limit(1);
      expect(monsterRow2[0]!.hp).toBe(46);
    }, 30000);

    it("fireball kills the monster → combat completes + exactly-once reward", async () => {
      const mPid = monsterParticipantId("ash_skeleton");
      const { host, sessionId, svc, combatId } = await startCombat("sk2", mPid);
      await db.update(combatParticipants).set({ hp: 5 }).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, mPid)));
      const r = await svc.useSkill(host.userId, sessionId, host.characterId, "fireball", mPid);
      expect(r.effect).toBe("damage");
      expect(r.victory).toBe(true);
      expect(r.reward?.alreadyClaimed).toBe(false);
      const done = await db.select().from(combats).where(eq(combats.id, combatId)).limit(1);
      expect(done[0]?.status).toBe("completed");
      expect(done[0]?.winner).toBe(host.characterId);
      const claims = await db.select().from(rewardClaims).where(eq(rewardClaims.characterId, host.characterId));
      expect(claims.filter((c) => c.rewardKey === `combat:${combatId}`)).toHaveLength(1);
      await expect(svc.useSkill(host.userId, sessionId, host.characterId, "fireball", mPid)).rejects.toThrow();
      const snap = await getGameSnapshot(db, host.userId, sessionId);
      expect(snap.combat?.status).toBe("completed");
    }, 30000);

    it("heal restores HP up to max and decreases mana, never exceeding max", async () => {
      const mPid = monsterParticipantId("ash_skeleton");
      const { host, sessionId, svc, combatId } = await startCombat("sk3", mPid);
      // Hurt the player so healing has headroom.
      await db.update(combatParticipants).set({ hp: 30 }).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, host.characterId)));
      const r = await svc.useSkill(host.userId, sessionId, host.characterId, "heal", null);
      expect(r.effect).toBe("heal");
      expect(r.amount).toBe(20); // healAmount(20, 30, 100) = 20
      expect(r.mana).toBe(35); // 50 - 15
      const charRow = await db.select().from(characters).where(eq(characters.id, host.characterId)).limit(1);
      expect(charRow[0]!.mana).toBe(35);
      const playerRow = await db.select().from(combatParticipants).where(and(
        eq(combatParticipants.combatId, combatId), eq(combatParticipants.characterId, host.characterId))).limit(1);
      // After heal (50) the monster counter hits (7) → 43; never above max.
      expect(playerRow[0]!.hp).toBeLessThanOrEqual(100);
      expect(playerRow[0]!.hp).toBeGreaterThan(0);
    }, 30000);

    it("enforces skill security and resource rules", async () => {
      const mPid = monsterParticipantId("ash_skeleton");
      const { host, guest, sessionId, svc } = await startCombat("sk4", mPid);
      const outsider = await createChar("sk_out");

      // non-member
      await expect(svc.useSkill(outsider.userId, sessionId, host.characterId, "fireball", mPid)).rejects.toThrow();
      // wrong owner (guest member, not owner of host char)
      await expect(svc.useSkill(guest.userId, sessionId, host.characterId, "fireball", mPid)).rejects.toThrow();
      // insufficient mana (set mana low)
      await db.update(characters).set({ mana: 5 }).where(eq(characters.id, host.characterId));
      await expect(svc.useSkill(host.userId, sessionId, host.characterId, "power_strike", mPid)).rejects.toThrow();
      // invalid skill id
      await db.update(characters).set({ mana: 50 }).where(eq(characters.id, host.characterId));
      await expect(svc.useSkill(host.userId, sessionId, host.characterId, "bogus", mPid)).rejects.toThrow();
      // invalid target (self as target for enemy skill) rejected
      await expect(svc.useSkill(host.userId, sessionId, host.characterId, "power_strike", host.characterId)).rejects.toThrow();
    }, 30000);
  });
});
