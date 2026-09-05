import { describe, expect, it } from "vitest";
import { createRng } from "@/game/engine";
import {
  chooseMonsterAction,
  monsterDamage,
  type MonsterInstant,
} from "@/game/combat";

const monsterId = "monster:ash_skeleton";

function instants(overrides: Partial<Record<string, boolean>> = {}): MonsterInstant[] {
  return [
    { participantId: "player-a", alive: overrides["player-a"] ?? true },
    { participantId: "player-b", alive: overrides["player-b"] ?? true },
  ];
}

describe("monster AI", () => {
  it("selects a living player target and attacks", () => {
    const d = chooseMonsterAction(monsterId, instants(), { rng: createRng(1) });
    expect(d.action).toBe("attack");
    expect(["player-a", "player-b"]).toContain(d.targetParticipantId);
    expect(d.targetParticipantId).not.toBe(monsterId);
  });

  it("never targets a dead participant", () => {
    const d = chooseMonsterAction(monsterId, instants({ "player-a": false }), { rng: createRng(1) });
    expect(d.targetParticipantId).toBe("player-b");
  });

  it("returns a none action when no living player target exists", () => {
    const d = chooseMonsterAction(monsterId, instants({ "player-a": false, "player-b": false }), { rng: createRng(5) });
    expect(d.action).toBe("none");
    expect(d.targetParticipantId).toBeNull();
  });

  it("is deterministic for a seeded RNG", () => {
    const a = chooseMonsterAction(monsterId, instants({ "player-a": true, "player-b": true }), { rng: createRng(42) });
    const b = chooseMonsterAction(monsterId, instants({ "player-a": true, "player-b": true }), { rng: createRng(42) });
    expect(a.targetParticipantId).toBe(b.targetParticipantId);
  });

  it("derives damage as max(1, attack - defense)", () => {
    expect(monsterDamage(12, 5)).toBe(7);
    expect(monsterDamage(5, 20)).toBe(1);
    expect(monsterDamage(10, 10)).toBe(1);
  });
});
