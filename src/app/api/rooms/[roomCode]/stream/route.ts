import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getDb } from "../../../../../db";
import {
  getRoomViewByCode,
  listRoomEventsAfter,
} from "../../../../../db/room-store";
import { SESSION_COOKIE } from "../../../../../lib/auth/cookie";
import { getAuthService } from "../../../../../lib/auth/service";
import { getRateLimiter } from "../../../../../server/rate-limit/service";
import { requireRoomMember } from "../../../../../server/room/authorization";
import { getRealtimeTransport } from "../../../../../server/realtime/hub";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a room.
 *
 * On connect the server (a) authenticates the session cookie, (b) verifies room
 * membership, (c) streams the authoritative snapshot plus any missed events
 * (reconnect support), and (d) streams live room events. It never trusts the
 * client for identity or state.
 *
 * This uses the in-process {@link getRealtimeTransport} hub, which is correct
 * for a single dev instance. For a multi-instance Vercel deployment the same
 * interface is backed by a distributed transport (see docs/MULTIPLAYER.md), so
 * this route does not change.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  const auth = await getAuthService();
  const user = token ? await auth.validate(token) : null;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate-limit connection attempts per user (process-local limiter).
  const limiter = getRateLimiter();
  const limited = await limiter.consume(`stream:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return new Response("Too many connection attempts", { status: 429 });
  }

  const db = await getDb();
  const room = await getRoomViewByCode(db, roomCode.toUpperCase());
  if (!room) {
    return new Response("Room not found", { status: 404 });
  }
  // Only room members may subscribe (idempotent authorization check).
  requireRoomMember(room, user.id);

  const since = Number(request.nextUrl.searchParams.get("since") ?? "0") || 0;
  const previous = await listRoomEventsAfter(db, room.id, since);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown, event?: string) => {
        if (closed) return;
        const data = JSON.stringify(payload);
        controller.enqueue(
          encoder.encode(event ? `event: ${event}\ndata: ${data}\n\n` : `data: ${data}\n\n`),
        );
      };

      send(
        { kind: "room_snapshot", roomId: room.id, snapshot: room },
        "snapshot",
      );
      for (const event of previous) {
        send({ kind: "room_event", roomId: room.id, event }, "event");
      }

      const unsubscribe = getRealtimeTransport().subscribeRoom(
        room.id,
        (message) => send(message, "message"),
      );

      const abort = () => {
        closed = true;
        unsubscribe();
        controller.close();
      };
      request.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
