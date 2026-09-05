"use server";

import type { ApiResult } from "../../types";
import { getDb } from "../../db";
import { requireUser } from "../../lib/auth/session";
import { runAction } from "../../lib/result";
import { getRealtimeTransport } from "../realtime/hub";
import { GameplayService } from "./gameplay";

/** Authoritative move on a session (membership + active-turn guard). */
export async function moveSessionAction(
  sessionId: string,
  nodeId: string,
): Promise<ApiResult<{ nodeId: string; stateVersion: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const service = new GameplayService(db, getRealtimeTransport());
    return service.move(user.id, sessionId, nodeId);
  });
}

/** Authoritative attack on a session. */
export async function attackSessionAction(
  sessionId: string,
  targetId: string,
): Promise<ApiResult<{ targetId: string; damage: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const service = new GameplayService(db, getRealtimeTransport());
    return service.attack(user.id, sessionId, targetId);
  });
}
