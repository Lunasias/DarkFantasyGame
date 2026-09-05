"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getMeAction } from "@/lib/auth/actions";
import type { AuthUser } from "@/lib/auth/auth-service";
import { unwrap } from "@/lib/unwrap";
import {
  joinRoomAction,
  kickPlayerAction,
  leaveRoomAction,
  setReadyAction,
  startGameAction,
  transferHostAction,
} from "@/server/room/actions";
import { useRoomStream } from "./use-room-stream";

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const { room, connected } = useRoomStream(roomCode);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [gameSessionId, setGameSessionId] = useState<string | null>(null);

  useEffect(() => {
    unwrap(getMeAction())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  async function guard(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const isMember = room?.players.some((p) => p.userId === me?.id) ?? false;
  const self = room?.players.find((p) => p.userId === me?.id);
  const isHost = room?.hostId === me?.id;

  if (!room) {
    return (
      <Shell>
        <p className="text-zinc-400">Loading room…</p>
        {!isMember && (
          <button
            disabled={busy}
            onClick={() =>
              guard(async () => {
                await unwrap(joinRoomAction({ roomCode }));
                window.location.reload();
              })
            }
            className="mt-4 rounded px-4 py-2 bg-emerald-700 text-white disabled:opacity-50"
          >
            Join room
          </button>
        )}
        {message && <p className="mt-2 text-red-400">{message}</p>}
      </Shell>
    );
  }

  const allReady =
    room.players.length > 0 && room.players.every((p) => p.ready);
  const canStart = isHost && room.status === "waiting" && room.players.length >= 2 && allReady;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{room.name}</h1>
          <p className="text-sm text-zinc-400">
            Code: <span className="font-mono text-zinc-200">{room.code}</span> ·{" "}
            {room.status}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            connected ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"
          }`}
        >
          {connected ? "live" : "reconnecting"}
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-400">
        {room.players.length}/{room.maxPlayers} players · {room.gameMode} ·{" "}
        {room.ruleset} · {room.visibility}
      </p>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {room.players.map((player) => (
          <div key={player.userId} className="flex items-center gap-3 p-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                player.connected ? "bg-emerald-500" : "bg-zinc-600"
              }`}
              title={player.connected ? "connected" : "offline"}
            />
            <span className="font-medium">{player.displayName}</span>
            <span className="text-xs text-zinc-500">slot {player.slot}</span>
            {player.isHost && (
              <span className="rounded bg-amber-800 px-2 py-0.5 text-xs text-amber-100">
                host
              </span>
            )}
            <span className="text-xs text-zinc-400">
              {player.ready ? "ready" : "not ready"}
            </span>
            {isHost && !player.isHost && player.userId !== me?.id && (
              <div className="ml-auto flex gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    guard(() =>
                      unwrap(transferHostAction({ roomId: room.id, targetUserId: player.userId })),
                    )
                  }
                  className="text-xs underline text-zinc-400 hover:text-zinc-200"
                >
                  transfer host
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    guard(() =>
                      unwrap(kickPlayerAction({ roomId: room.id, targetUserId: player.userId })),
                    )
                  }
                  className="text-xs underline text-red-400 hover:text-red-300"
                >
                  kick
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {message && <p className="mt-3 text-sm text-red-400">{message}</p>}
      {gameSessionId && (
        <p className="mt-3 text-sm text-emerald-400">
          Game started — session {gameSessionId.slice(0, 8)}…
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {isMember && room.status === "waiting" && (
          <button
            disabled={busy}
            onClick={() =>
              guard(async () => {
                await unwrap(setReadyAction({ roomId: room.id, ready: !self?.ready }));
              })
            }
            className="rounded px-4 py-2 bg-zinc-800 text-white disabled:opacity-50"
          >
            {self?.ready ? "Un-ready" : "Ready"}
          </button>
        )}
        {isHost && (
          <button
            disabled={busy || !canStart}
            onClick={() =>
              guard(async () => {
                const result = await unwrap(startGameAction({ roomId: room.id }));
                setGameSessionId(result.gameSessionId);
              })
            }
            className="rounded px-4 py-2 bg-emerald-700 text-white disabled:opacity-40"
          >
            Start game
          </button>
        )}
        {isMember && (
          <button
            disabled={busy}
            onClick={() =>
              guard(async () => {
                await unwrap(leaveRoomAction({ roomId: room.id }));
                router.push("/lobby");
              })
            }
            className="rounded px-4 py-2 bg-zinc-800 text-zinc-300 disabled:opacity-50"
          >
            Leave
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        {children}
      </div>
    </main>
  );
}
