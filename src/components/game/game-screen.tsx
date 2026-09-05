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
  useSkillAction as invokeSkillAction,
  acceptQuestAction,
  completeQuestAction,
  resolveWorldEventAction,
  enterTownAction,
  enterDungeonAction,
  completeDungeonAction,
  buySessionAction,
  sellSessionAction,
  equipItemSessionAction,
  unequipItemSessionAction,
} from "@/server/game/gameplay-actions";
import {
  encounterForNode,
  isMonsterParticipant,
  monsterForParticipant,
  getNodeInteractions,
  allQuests,
} from "@/game/content";
import { allSkills } from "@/game/combat";
import { expToNextLevel } from "@/game/progression";
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
  const content = meChar ? snapshot.content[meChar.characterId] : undefined;
  const nodeContent = meNode ? getNodeInteractions(meNode) : { town: null, event: null, dungeon: null };
  const acceptedQuests = content?.quests ?? [];
  const questById = new Map(acceptedQuests.map((q) => [q.questId, q]));

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
            <p className="text-sm text-zinc-200">
              {meChar.jobId ?? "No job"} · Level {meChar.level}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              EXP {meChar.experience} / next {expToNextLevel(meChar.level)}
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-blue-600"
                style={{ width: `${Math.min(100, Math.round((meChar.experience / expToNextLevel(meChar.level)) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              HP {meChar.health}/{meChar.maxHealth} · MP {meChar.mana}/{meChar.maxMana} · Gold {meChar.gold}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ATK {meChar.effectiveStats.attack} · DEF {meChar.effectiveStats.defense} · SPD {meChar.effectiveStats.speed}
            </p>
            {Object.keys(meChar.equipment).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {Object.entries(meChar.equipment).map(([slot, itemId]) => (
                  <li key={slot} className="flex items-center justify-between">
                    <span className="text-emerald-300">{slot}</span>
                    <span>{itemId}</span>
                    <button
                      disabled={busy}
                      onClick={() => guard(() => unequipItemSessionAction(sessionId, meChar.characterId, slot))}
                      className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 disabled:opacity-50"
                    >
                      Unequip
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {meChar && (
          <Section title="Inventory">
            {meChar.inventory.length === 0 ? (
              <p className="text-xs text-zinc-600">Empty.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {meChar.inventory.map((i) => {
                  const equippable = i.slot != null;
                  const equipped = i.equippedSlot != null;
                  return (
                    <li key={i.itemId} className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200">{i.name}</span>
                        <span className="text-xs text-zinc-500">×{i.quantity}</span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {i.category} {i.slot ? `· ${i.slot}` : ""} {equipped ? "· equipped" : ""}
                      </p>
                      {equippable && !equipped && (
                        <button
                          disabled={busy}
                          onClick={() => guard(() => equipItemSessionAction(sessionId, meChar.characterId, i.itemId))}
                          className="mt-2 rounded bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Equip
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {meChar && snapshot.shop && (
          <Section title="Shop">
            <p className="text-xs text-zinc-500">Gold {meChar.gold}</p>
            {snapshot.shop.shops.map((shop) => (
              <div key={shop.id} className="mt-2">
                <p className="text-sm text-zinc-200">{shop.name}</p>
                <ul className="mt-1 space-y-2 text-sm">
                  {shop.inventory.map((item) => {
                    const owned = meChar.inventory.find((i) => i.itemId === item.itemId)?.quantity ?? 0;
                    const canBuy = meChar.gold >= item.buyPrice;
                    return (
                      <li key={item.itemId} className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200">{item.name}</span>
                          <span className="text-xs text-zinc-500">{item.buyPrice} g</span>
                        </div>
                        <p className="text-xs text-zinc-500">{item.category} · owned {owned}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            disabled={busy || !canBuy}
                            onClick={() => guard(() => buySessionAction(sessionId, meChar.characterId, shop.id, item.itemId, 1))}
                            className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-40"
                          >
                            Buy
                          </button>
                          <button
                            disabled={busy || owned < 1}
                            onClick={() => guard(() => sellSessionAction(sessionId, meChar.characterId, shop.id, item.itemId, 1))}
                            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 disabled:opacity-40"
                          >
                            Sell ({item.sellPrice} g)
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
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
            {combat.status === "active" && combat.combatTurnType === "monster" && (
              <p className="mt-3 text-sm font-medium text-amber-300">Enemy turn…</p>
            )}
            {combat.status === "completed" && (
              isMonsterParticipant(combat.winner ?? "")
                ? (
                  <p className="mt-3 text-sm font-medium text-red-400">
                    Defeat — the enemy won.
                  </p>
                )
                : (
                  <p className="mt-3 text-sm font-medium text-emerald-400">
                    Victory — winner {combat.winner?.slice(0, 8) ?? "unknown"}
                  </p>
                )
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
            {combat.status === "active" && combat.combatTurnType !== "monster" && !canAttack && meCombatant && (
              <p className="mt-3 text-xs text-zinc-500">Waiting for the active combatant…</p>
            )}
          </Section>
        )}

        {combat && combat.status === "active" && meChar && meCombatant && (
          <Section title="Skills">
            <p className="text-xs text-zinc-500">Mana {meChar.mana}/{meChar.maxMana}</p>
            <ul className="mt-2 space-y-2 text-sm">
              {allSkills().filter((s) => s.id !== "basic_attack").map((s) => {
                const cdReady = meCombatant ? (meCombatant.cooldowns[s.id] ?? 0) : 0;
                const cdRemaining = Math.max(0, cdReady - combat.combatTurn);
                const offCooldown = cdRemaining === 0;
                const enoughMana = meChar.mana >= s.manaCost;
                const enabled = canAttack && offCooldown && enoughMana && !busy;
                const target = s.target === "enemy"
                  ? combat.participants.find((p) => p.characterId !== meChar.characterId && p.alive)?.characterId ?? null
                  : null;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-zinc-200">{s.name}</span>
                    <span className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{s.manaCost} MP</span>
                      {s.cooldown > 0 && <span>CD {cdRemaining > 0 ? cdRemaining : s.cooldown}</span>}
                      <button
                        disabled={!enabled}
                        onClick={() => guard(() => invokeSkillAction(sessionId, meChar.characterId, s.id, target))}
                        className="rounded bg-blue-800 px-2.5 py-1 text-xs text-white disabled:opacity-40"
                      >
                        Use
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-zinc-600">
              {!canAttack ? "Enemy turn — skills locked." : "Choose a skill."}
            </p>
          </Section>
        )}

        {!combat && meChar && meNode && (
          <Section title="World">
            <p className="text-xs text-zinc-500">You are at node <span className="text-zinc-300">{meNode}</span>.</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {nodeContent.town && (
                <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <p className="text-zinc-200">
                    Town · <span className="text-emerald-300">{nodeContent.town.name}</span>
                  </p>
                  <p className="text-xs text-zinc-500">{nodeContent.town.description}</p>
                  <button
                    disabled={busy}
                    onClick={() => guard(() => enterTownAction(sessionId, meChar.characterId, nodeContent.town!.id))}
                    className="mt-2 rounded bg-emerald-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Enter town
                  </button>
                </div>
              )}
              {nodeContent.event && (
                <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <p className="text-zinc-200">
                    Event · <span className="text-amber-300">{nodeContent.event.name}</span>
                  </p>
                  <p className="text-xs text-zinc-500">{nodeContent.event.description}</p>
                  <button
                    disabled={busy}
                    onClick={() => guard(() => resolveWorldEventAction(sessionId, meChar.characterId, nodeContent.event!.id))}
                    className="mt-2 rounded bg-amber-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Resolve event
                  </button>
                </div>
              )}
              {nodeContent.dungeon && (
                <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <p className="text-zinc-200">
                    Dungeon · <span className="text-purple-300">{nodeContent.dungeon.name}</span>
                  </p>
                  <p className="text-xs text-zinc-500">{nodeContent.dungeon.description}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => guard(() => enterDungeonAction(sessionId, meChar.characterId, nodeContent.dungeon!.id))}
                      className="rounded bg-purple-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Enter dungeon
                    </button>
                    {content?.dungeons.find((d) => d.dungeonId === nodeContent.dungeon!.id)?.status === "entered" && (
                      <button
                        disabled={busy}
                        onClick={() => guard(() => completeDungeonAction(sessionId, meChar.characterId, nodeContent.dungeon!.id))}
                        className="rounded bg-purple-800 px-3 py-1 text-xs text-white disabled:opacity-50"
                      >
                        Complete dungeon
                      </button>
                    )}
                  </div>
                </div>
              )}
              {encounter && (
                <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <p className="text-zinc-200">
                    Encounter · <span className="text-red-300">monster</span>
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => guard(() => startEncounterAction(sessionId, meChar.characterId))}
                    className="mt-2 rounded bg-red-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Start encounter
                  </button>
                </div>
              )}
              {!nodeContent.town && !nodeContent.event && !nodeContent.dungeon && !encounter && (
                <p className="text-xs text-zinc-600">Nothing to interact with here.</p>
              )}
            </div>
          </Section>
        )}

        {meChar && (
          <Section title="Quests">
            <ul className="space-y-2 text-sm">
              {allQuests().map((q) => {
                const mine = questById.get(q.id);
                const status = mine?.status ?? "available";
                const objectives = mine?.objectives ?? [];
                return (
                  <li key={q.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                    <p className="text-zinc-200">{q.name}</p>
                    <p className="text-xs text-zinc-500">{q.description}</p>
                    {status !== "available" && objectives.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                        {objectives.map((o) => (
                          <li key={o.objectiveId}>
                            {o.target}: {o.progress}/{o.amount} {o.done ? "✓" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {status === "available" && (
                        <button
                          disabled={busy}
                          onClick={() => guard(() => acceptQuestAction(sessionId, meChar.characterId, q.id))}
                          className="rounded bg-blue-800 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                      {status === "accepted" && (
                        <button
                          disabled={busy}
                          onClick={() => guard(() => completeQuestAction(sessionId, meChar.characterId, q.id))}
                          className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Complete
                        </button>
                      )}
                      {status === "completed" && <span className="text-xs text-emerald-400">Completed</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
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
