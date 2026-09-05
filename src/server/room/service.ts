import { getDb } from "../../db";
import { createRateLimiter } from "../rate-limit/rate-limiter";
import { getRealtimeTransport } from "../realtime/hub";
import { RoomAppService } from "./room-app-service";

let instance: RoomAppService | null = null;

/** Lazily-built singleton authoritative room service. */
export async function getRoomAppService(): Promise<RoomAppService> {
  if (!instance) {
    const db = await getDb();
    instance = new RoomAppService(
      db,
      getRealtimeTransport(),
      createRateLimiter(),
    );
  }
  return instance;
}

/** Test hook: inject or clear the singleton. */
export function setRoomAppService(service: RoomAppService | null): void {
  instance = service;
}
