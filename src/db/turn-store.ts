import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { gameSessions } from "./schema/game-sessions";
import { turns } from "./schema/turns";
import { gameEvents } from "./schema/game-events";
import { createId } from "../game/engine/id";
import type { TurnEvent } from "../game/engine/turn-engine";

export interface PersistTurnInput {
  gameSessionId: string;
  playerId: string | null;
  turn: number;
  stateVersion: number;
  result: Record<string, unknown>;
  events: readonly TurnEvent[];
}

/**
 * Persist an authoritative turn result and its events atomically: advance the
 * session's current turn + state version, write the `turns` row, and append the
 * `game_events` rows with server-assigned monotonic sequences.
 *
 * This connects the framework-independent {@link TurnEngine} to the database.
 * Runs inside a transaction and is only invoked for authoritative mutations
 * (not per render/frame).
 */
export async function persistTurn(db: Db, input: PersistTurnInput): Promise<void> {
  await db.transaction(async (tx) => {
    const exec = tx as unknown as Db;

    await exec
      .update(gameSessions)
      .set({
        phase: "active",
        currentTurnNumber: input.turn,
        stateVersion: input.stateVersion,
      })
      .where(eq(gameSessions.id, input.gameSessionId));

    const now = new Date();
    await exec.insert(turns).values({
      id: createId(),
      gameSessionId: input.gameSessionId,
      turnNumber: input.turn,
      playerId: input.playerId,
      state: input.result,
      endedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    let sequence = 0;
    for (const event of input.events) {
      // Only persist the turn-lifespan events, with monotonically increasing
      // sequence per session.
      sequence += 1;
      await exec.insert(gameEvents).values({
        id: createId(),
        gameSessionId: input.gameSessionId,
        actorId: event.playerId,
        type: event.type,
        sequence,
        payload: event.data ?? {},
        createdAt: new Date(event.timestamp),
      });
    }
  });
}
