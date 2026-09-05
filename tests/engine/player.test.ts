import { describe, expect, it } from "vitest";
import { createCharacter, createPlayer } from "@/game/engine";

describe("Player", () => {
  it("creates a player with a fresh id and name", () => {
    const player = createPlayer("Morgath");
    expect(player.id).toBeTruthy();
    expect(player.name).toBe("Morgath");
  });

  it("rejects an empty name", () => {
    expect(() => createPlayer("   ")).toThrow();
  });
});

describe("Character", () => {
  it("creates a character with default stats", () => {
    const character = createCharacter({ name: "Vex", archetype: "warden" });
    expect(character.name).toBe("Vex");
    expect(character.stats.maxHealth).toBeGreaterThan(0);
    expect(character.isAlive).toBe(true);
  });

  it("clamps starting health to maxHealth", () => {
    const character = createCharacter({
      name: "Vex",
      archetype: "warden",
      stats: { maxHealth: 50, health: 80 },
    });
    expect(character.stats.health).toBe(50);
  });

  it("applies damage then heals up to the maximum", () => {
    const character = createCharacter({ name: "Vex", archetype: "warden" });
    expect(character.takeDamage(30)).toBe(30);
    expect(character.stats.health).toBe(70);
    expect(character.heal(100)).toBe(30);
    expect(character.stats.health).toBe(100);
  });
});
