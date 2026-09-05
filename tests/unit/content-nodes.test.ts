import { describe, expect, it } from "vitest";
import { getNodeInteractions } from "@/game/content";

describe("getNodeInteractions", () => {
  it("resolves town/event/dungeon content at the canonical board nodes", () => {
    // Town (ashenfall) at C.
    expect(getNodeInteractions("C").town?.id).toBe("ashenfall");
    // World event (cursed_shrine) at B.
    expect(getNodeInteractions("B").event?.id).toBe("cursed_shrine");
    // Dungeon (crypt_of_ash) at D.
    expect(getNodeInteractions("D").dungeon?.id).toBe("crypt_of_ash");
  });

  it("returns nulls for a plain node with no content", () => {
    const r = getNodeInteractions("A");
    expect(r.town).toBeNull();
    expect(r.event).toBeNull();
    expect(r.dungeon).toBeNull();
  });

  it("does not mix kinds between nodes", () => {
    expect(getNodeInteractions("C").dungeon).toBeNull();
    expect(getNodeInteractions("B").town).toBeNull();
    expect(getNodeInteractions("D").event).toBeNull();
  });
});
