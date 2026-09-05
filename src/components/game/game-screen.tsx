"use client";

import { useGameState } from "./use-game-state";

export function GameScreen({ sessionId }: { sessionId: string }) {
  const { snapshot, status, error, live } = useGameState(sessionId);

  if (status === "loading") {
    return <Status>Loading game state…</Status>;
  }
  if (status === "error") {
    return <Status tone="error">{error ?? "Could not load the game."}</Status>;
  }
  if (!snapshot) return <Status>No game state.</Status>;

  return (
    <main className="flex flex-1 justify-center px-6 py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Game Session</h1>
          <span className={`rounded-full px-3 py-1 text-xs ${live ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>
            {live ? "live" : "reconnecting"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Phase" value={snapshot.phase} />
          <Field label="Turn" value={String(snapshot.currentTurnNumber)} />
          <Field label="State version" value={String(snapshot.stateVersion)} />
          <Field label="Session" value={snapshot.sessionId.slice(0, 8)} />
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="mb-2 font-medium">Players / positions</h2>
          {snapshot.positions.length === 0 ? (
            <p className="text-sm text-zinc-500">No positions recorded.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {snapshot.positions.map((p) => (
                <li key={p.characterId} className="flex justify-between py-1.5">
                  <span className="font-mono">{p.characterId.slice(0, 8)}</span>
                  <span className="text-zinc-400">Node {p.nodeId}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
          <h2 className="mb-2 font-medium">Combat</h2>
          {snapshot.combat ? (
            <p>
              Status: <span className="text-zinc-200">{snapshot.combat.status}</span>
            </p>
          ) : (
            <p className="text-zinc-500">No active combat.</p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
          <h2 className="mb-2 font-medium text-zinc-200">Character (placeholder)</h2>
          <p>Character stats, EXP, gold, and inventory/equipment render here in a later phase.</p>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-zinc-100">{value}</div>
    </div>
  );
}

function Status({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <p className={`text-sm ${tone === "error" ? "text-red-400" : "text-zinc-400"}`}>
        {children}
      </p>
    </main>
  );
}
