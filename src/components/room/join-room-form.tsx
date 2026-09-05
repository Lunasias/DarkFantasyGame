"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { joinRoomAction } from "@/server/room/actions";
import { unwrap } from "@/lib/unwrap";

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await unwrap(joinRoomAction({ roomCode: code }));
      router.push(`/rooms/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Room code"
        required
        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono uppercase text-zinc-100"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy}
        className="rounded bg-zinc-100 px-4 py-2 font-medium text-zinc-900 disabled:opacity-50"
      >
        {busy ? "Joining…" : "Join room"}
      </button>
    </form>
  );
}
