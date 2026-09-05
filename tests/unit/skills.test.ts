import { describe, expect, it } from "vitest";
import {
  allSkills,
  getSkill,
  healAmount,
  listSkillIds,
  maxManaFor,
  skillDamage,
  validateSkillDefinition,
} from "@/game/combat";

describe("skill registry", () => {
  it("registers unique skills and resolves by id", () => {
    expect(allSkills().length).toBeGreaterThanOrEqual(4);
    const ids = allSkills().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getSkill("power_strike")?.manaCost).toBe(10);
    expect(getSkill("fireball")?.effect).toBe("damage");
    expect(getSkill("heal")?.target).toBe("self");
    expect(getSkill("nope")).toBeNull();
    expect(listSkillIds()).toContain("fireball");
  });

  it("rejects invalid skill definitions", () => {
    const base = { id: "x", name: "X", description: "", manaCost: 0, cooldown: 0, target: "enemy" as const, effect: "damage" as const, power: 5 };
    expect(() => validateSkillDefinition({ ...base, manaCost: -1 })).toThrow();
    expect(() => validateSkillDefinition({ ...base, cooldown: -1 })).toThrow();
    expect(() => validateSkillDefinition({ ...base, target: "friend" as never })).toThrow();
    expect(() => validateSkillDefinition({ ...base, effect: "none" as never })).toThrow();
    expect(() => validateSkillDefinition({ ...base, power: 0 })).not.toThrow();
  });
});

describe("mana", () => {
  it("computes max mana deterministically by level", () => {
    expect(maxManaFor(1)).toBe(50);
    expect(maxManaFor(2)).toBe(60);
    expect(maxManaFor(11)).toBe(150);
    expect(maxManaFor(0)).toBe(50); // clamped
  });
});

describe("skill damage", () => {
  it("multiplier skills use effective attack: max(1, attack*mult - defense)", () => {
    const skill = getSkill("power_strike")!;
    expect(skillDamage(skill, 12, 5)).toBe(19);
    expect(skillDamage(skill, 2, 100)).toBe(1);
  });

  it("power skills use flat power: max(1, power - defense)", () => {
    const skill = getSkill("fireball")!;
    expect(skillDamage(skill, 0, 5)).toBe(20);
    expect(skillDamage(skill, 0, 50)).toBe(1);
  });

  it("is integer-safe and deterministic", () => {
    const skill = getSkill("fireball")!;
    const a = skillDamage(skill, 10, 5);
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(skillDamage(skill, 10, 5)).toBe(a);
  });
});

describe("healing", () => {
  it("heals up to max HP and never exceeds it", () => {
    const skill = getSkill("heal")!;
    expect(healAmount(skill, 40, 100)).toBe(20);
    expect(healAmount(skill, 95, 100)).toBe(5);
    expect(healAmount(skill, 100, 100)).toBe(0);
    expect(healAmount(skill, 0, 100)).toBe(20);
  });
});
