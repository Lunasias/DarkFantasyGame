"use client";

import { useEffect, useState } from "react";
import { loadSessionStateAction, type GameSnapshot } from "@/server/game/actions";
import { unwrap } from "@/lib/unwrap";

/**
 * Client projection of authoritative game state. On mount it loads the DB
 * snapshot (server-authoritative), then subscribes to the room SSE stream for
 * live notifications. The client never derives authoritative values — realtime
 * only signals; state always comes from the server snapshot. Stale/duplicate
 * snapshots are coalesced by stateVersion.
 */
export function useGameState(sessionId: string) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lastVersion, setLastVersion] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await unwrap(loadSessionStateAction(sessionId));
        if (alive) {
          setSnapshot(s);
          setLastVersion(s.stateVersion);
          setStatus("ready");
        }
      } catch (e) {
        if (alive) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Failed to load game state");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, now]);

  useEffect(() => {
    if (!snapshot?.roomCode) return;
    const source = new EventSource(`/api/rooms/${encodeURIComponent(snapshot.roomCode)}/stream`);
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as { kind: string };
        if (msg.kind === "room_snapshot" && snapshot && snapshot.stateVersion > (lastVersion ?? -1)) {
          // Server is authoritative; the DB snapshot on reconnect always wins.
          setLastVersion(snapshot.stateVersion);
        }
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      source.close();
      setLive(false);
    };
  }, [snapshot?.roomCode, snapshot, lastVersion]);

  const refresh = () => setNow((n) => n + 1);

  return { snapshot, status, error, live, refresh };
}
