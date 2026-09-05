"use client";

import { useEffect, useState } from "react";
import { useGameState } from "./use-game-state";
import { GameBoard3D } from "./3d/game-board-3d";
import { getMeAction } from "@/lib/auth/actions";
import {
  attackSessionAction,
  moveSessionAction,
  rollDiceAction,
  startEncounterAction,
} from "@/server/game/gameplay-actions";
import {
  encounterForNode,
  isMonsterParticipant,
  monsterForParticipant,
} from "@/game/content";
import { unwrap } from "@/lib/unwrap";
import type { AuthUser } from "@/lib/auth/auth-service";

const BOARD_NODES = ["A", "B", "C", "D", "E"];

export function GameScreen({ sessionId }: { sessionId: string }) {
  const { snapshot, status, error, live, refresh } = useGameState(sessionId);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [dice, setDice] = useState<number | null>(null);
  const [dest, setDest] = useState<string>("B");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [attackingId, setAttackingId] = useState<string | null>(null);

  useEffect(() => {
    unwrap(getMeAction())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  async function guard(fn: () => Promise<unknown>, onOk?: (d: unknown) => void) {
    setBusy(true);
    setMsg(null);
    try {
      const d = await fn();
      onOk?.(d);
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <Status>Loading game state…</Status>;
  if (status === "error") return <Status tone="error">{error ?? "Could not load the game."}</Status>;
  if (!snapshot) return <Status>No game state.</Status>;

  const meChar = snapshot.characters.find((c) => c.userId === me?.id);
  const combat = snapshot.combat;
  const meCombatant = meChar ? combat?.participants.find((p) => p.characterId === meChar.characterId) : undefined;
  const myTurn = snapshot.activePlayer === me?.id;
  const meNode = meChar ? snapshot.positions.find((p) => p.characterId === meChar.characterId)?.nodeId ?? null : null;
  const encounter = meNode ? encounterForNode(meNode) : null;
  const canAttack = !!meChar && !!meCombatant && !!combat && combat.status === "active" && combat.activeCombatant === meChar.characterId;

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4 lg:flex-row">
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-zinc-800">
        <GameBoard3D snapshot={snapshot} selectedNode={dest} attackingId={attackingId} />
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs ${live ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>
          {live ? "live" : "reconnecting"}
        </span>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-[340px]">
        <Section title="Session">
          <p className="text-sm text-zinc-300">
            Phase <span className="text-zinc-100">{snapshot.phase}</span> · Turn{" "}
            <span className="text-zinc-100">{snapshot.currentTurnNumber}</span> · State{" "}
            <span className="text-zinc-100">{snapshot.stateVersion}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Active: <span className="text-zinc-300">{snapshot.activePlayer?.slice(0, 8) ?? "—"}</span>
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-200">
            <span
              className={`inline-block h-5 w-5 rounded border border-zinc-300 text-center leading-5 ${
                rolling ? "animate-spin" : ""
              }`}
            >
              {dice !== null ? dice : "—"}
            </span>
            <span className="text-xs text-zinc-500">dice</span>
          </div>
          {msg && <p className="mt-1 text-xs text-red-400">{msg}</p>}

          {myTurn && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy || rolling}
                onClick={() => {
                  setRolling(true);
                  guard(
                    () => rollDiceAction(sessionId),
                    (d) => {
                      setDice((d as { dice: number }).dice);
                      setRolling(false);
                    },
                  ).finally(() => setRolling(false));
                }}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {rolling ? "Rolling…" : "Roll"}
              </button>
              <select
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              >
                {BOARD_NODES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                disabled={busy}
                onClick={() => guard(() => moveSessionAction(sessionId, dest))}
                className="rounded bg-zinc-100 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
              >
                Move
              </button>
            </div>
          )}
        </Section>

        {meChar && (
          <Section title="Character">
            <p className="text-sm text-zinc-300">
              {meChar.jobId ?? "No job"} · Lv {meChar.level} · EXP {meChar.experience}
            </p>
            <p className="text-sm text-zinc-300">
              HP {meChar.health}/{meChar.maxHealth} · Gold {meChar.gold}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ATK {meChar.effectiveStats.attack} · DEF {meChar.effectiveStats.defense}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Inventory:{" "}
              {meChar.inventory.length === 0
                ? "empty"
                : meChar.inventory.map((i) => `${i.itemId}×${i.quantity}`).join(", ")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Equipped:{" "}
              {Object.keys(meChar.equipment).length === 0
                ? "none"
                : Object.entries(meChar.equipment).map(([slot, item]) => `${slot}=${item}`).join(", ")}
            </p>
          </Section>
        )}

        {combat && (
          <Section title="Combat">
            <p className="text-sm text-zinc-300">
              Status <span className="text-zinc-100">{combat.status}</span> · Winner{" "}
              <span className="text-zinc-100">{combat.winner?.slice(0, 8) ?? "—"}</span>
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {combat.participants.map((p) => {
                const monster = monsterForParticipant(p.characterId);
                return (
                  <li key={p.characterId} className="flex items-center gap-2" style={{ opacity: p.alive ? 1 : 0.35 }}>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" style={{ opacity: p.alive ? 1 : 0.2 }} />
                    <span className={isMonsterParticipant(p.characterId) ? "text-red-300" : "font-mono"}>
                      {monster?.name ?? p.characterId.slice(0, 6)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded bg-zinc-800">
                        <span
                          className="block h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${(p.hp / p.maxHp) * 100}%` }}
                        />
                      </span>
                      <span className="text-xs text-zinc-400">{p.hp}/{p.maxHp}</span>
                    </span>
                    {combat.activeCombatant === p.characterId && <span className="text-amber-300">●</span>}
                  </li>
                );
              })}
            </ul>
            {combat.status === "completed" && (
              <p className="mt-3 text-sm font-medium text-emerald-400">
                Victory — winner {monsterForParticipant(combat.winner ?? "")?.name ?? combat.winner?.slice(0, 8) ?? "unknown"}
              </p>
            )}
            {canAttack && (
              <button
                disabled={busy}
                onClick={() => {
                  const target = combat.participants.find((p) => p.characterId !== meChar?.characterId && p.alive);
                  if (target && meChar) {
                    setAttackingId(meChar.characterId);
                    guard(() => attackSessionAction(sessionId, meChar.characterId, target.characterId))
                      .finally(() => setTimeout(() => setAttackingId(null), 600));
                  }
                }}
                className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Attack
              </button>
            )}
          </Section>
        )}

        {!combat && meChar && encounter && (
          <Section title="Encounter">
            <p className="text-sm text-zinc-300">
              A monster lurks at <span className="text-zinc-100">{meNode}</span>.
            </p>
            <button
              disabled={busy}
              onClick={() => guard(() => startEncounterAction(sessionId, meChar.characterId))}
              className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Start encounter
            </button>
          </Section>
        )}
      </aside>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}

function Status({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <p className={`text-sm ${tone === "error" ? "text-red-400" : "text-zinc-400"}`}>{children}</p>
    </main>
  );
}
