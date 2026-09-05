"use server";

import type { ApiResult } from "../../types";
import { getDb } from "../../db";
import { requireUser } from "../../lib/auth/session";
import { runAction } from "../../lib/result";
import { getGameSnapshot } from "./game-state";

export interface GameSnapshot {
  readonly sessionId: string;
  readonly roomId: string;
  readonly roomCode: string | null;
  readonly phase: string;
  readonly currentTurnNumber: number;
  readonly stateVersion: number;
  readonly activePlayer: string | null;
  readonly positions: readonly { characterId: string; nodeId: string }[];
  readonly characters: readonly {
    readonly characterId: string;
    readonly userId: string;
    readonly jobId: string | null;
    readonly level: number;
    readonly experience: number;
    readonly health: number;
    readonly maxHealth: number;
    readonly gold: number;
    readonly effectiveStats: { maxHealth: number; health: number; attack: number; defense: number; speed: number };
    readonly inventory: readonly { itemId: string; quantity: number }[];
    readonly equipment: Readonly<Record<string, string>>;
  }[];
  readonly combat: {
    readonly id: string;
    readonly status: string;
    readonly activeCombatant: string | null;
    readonly winner: string | null;
    readonly combatTurn: number;
    readonly stateVersion: number;
    readonly participants: readonly {
      readonly characterId: string; readonly hp: number; readonly maxHp: number;
      readonly attack: number; readonly defense: number; readonly alive: boolean;
    }[];
  } | null;
}

/** Authenticated resume: loads the authoritative DB snapshot for a session. */
export async function loadSessionStateAction(
  sessionId: string,
): Promise<ApiResult<GameSnapshot>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    return getGameSnapshot(db, user.id, sessionId);
  });
}
