"use server";

import type { ApiResult } from "../../types";
import { getDb } from "../../db";
import { requireUser } from "../../lib/auth/session";
import { runAction } from "../../lib/result";
import { getGameSnapshot } from "./game-state";

export interface GameSnapshot {
  readonly sessionId: string;
  readonly roomCode: string | null;
  readonly phase: string;
  readonly currentTurnNumber: number;
  readonly stateVersion: number;
  readonly positions: readonly { characterId: string; nodeId: string }[];
  readonly combat: { id: string; status: string } | null;
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
