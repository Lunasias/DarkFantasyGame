import { describe, expect, it } from "vitest";
import {
  allEncounters,
  allMonsters,
  encounterForNode,
  encounterRewardFor,
  getEncounter,
  getMonster,
  isMonsterParticipant,
  monsterForParticipant,
  monsterParticipantId,
} from "@/game/content";
import { validateReward } from "@/game/rewards";

describe("PvE encounter definitions", () => {
  it("registers monsters + encounters with unique ids", () => {
    expect(allMonsters().length).toBeGreaterThan(0);
    expect(allEncounters().length).toBeGreaterThan(0);
    const ids = allMonsters().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every monster reward and stat is valid", () => {
    for (const m of allMonsters()) {
      validateReward(m.reward);
      expect(Number.isSafeInteger(m.maxHealth)).toBe(true);
      expect(m.maxHealth).toBeGreaterThan(0);
    }
  });

  it("maps nodes to encounters and monsters by id", () => {
    const e = encounterForNode("B");
    expect(e).not.toBeNull();
    expect(getMonster(e!.monsterId)).not.toBeNull();
    expect(encounterForNode("A")).toBeNull();
    expect(getEncounter(e!.id)).toBe(e);
    expect(getMonster("nope")).toBeNull();
  });

  it("models monster combat participant identity", () => {
    const pid = monsterParticipantId("ash_skeleton");
    expect(pid).toBe("monster:ash_skeleton");
    expect(isMonsterParticipant(pid)).toBe(true);
    expect(isMonsterParticipant("player-char")).toBe(false);
    expect(monsterForParticipant(pid)?.name).toBe("Ash Skeleton");
    expect(monsterForParticipant("player-char")).toBeNull();
  });

  it("returns the monster reward for a PvE combat and null otherwise", () => {
    const pid = monsterParticipantId("ash_skeleton");
    const r = encounterRewardFor(["char-a", pid]);
    expect(r).not.toBeNull();
    expect(r!.gold).toBe(80);
    expect(encounterRewardFor(["char-a"])).toBeNull();
  });
});
