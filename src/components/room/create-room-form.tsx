"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createRoomAction } from "@/server/room/actions";
import { unwrap } from "@/lib/unwrap";

export function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await unwrap(
        createRoomAction({ name, maxPlayers, visibility }),
      );
      router.push(`/rooms/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name"
        required
        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
      />
      <div className="flex gap-2">
        <select
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
        >
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n} players
            </option>
          ))}
        </select>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "public" | "private")}
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
        >
          <option value="public">public</option>
          <option value="private">private</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy}
        className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}
