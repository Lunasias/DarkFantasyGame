import { describe, expect, it } from "vitest";
import { GameError, createPlayer, createSession } from "@/game/engine";

describe("GameSession", () => {
  it("creates a session in the lobby phase with sensible defaults", () => {
    const session = createSession();
    expect(session.phase).toBe("lobby");
    expect(session.maxPlayers).toBe(4);
    expect(session.playerCount).toBe(0);
    expect(session.id).toBeTruthy();
    expect(session.currentTurn).toBeNull();
  });

  it("validates the maxPlayers bounds", () => {
    expect(() => createSession({ maxPlayers: 1 })).toThrow();
    expect(() => createSession({ maxPlayers: 17 })).toThrow();
  });

  it("seats players and enforces the maximum", () => {
    const session = createSession({ maxPlayers: 2 });
    session.addPlayer(createPlayer("A"));
    session.addPlayer(createPlayer("B"));
    expect(session.playerCount).toBe(2);
    expect(session.isFull).toBe(true);
    expect(() => session.addPlayer(createPlayer("C"))).toThrow(GameError);
  });

  it("rejects a duplicate player", () => {
    const session = createSession();
    const player = createPlayer("A");
    session.addPlayer(player);
    expect(() => session.addPlayer(player)).toThrow(GameError);
  });

  it("starts into active play and begins the first turn", () => {
    const session = createSession();
    const player = createPlayer("A");
    session.addPlayer(player);
    session.start();
    expect(session.phase).toBe("active");
    expect(session.currentTurn).toBeTruthy();
    expect(session.currentTurn?.number).toBe(1);
    expect(session.currentTurn?.playerId).toBe(player.id);
  });

  it("rejects adding a player after the session has started", () => {
    const session = createSession();
    session.addPlayer(createPlayer("A"));
    session.start();
    expect(() => session.addPlayer(createPlayer("B"))).toThrow(GameError);
  });

  it("rotates turns in seated order on end_turn", () => {
    const session = createSession();
    const a = createPlayer("A");
    const b = createPlayer("B");
    const c = createPlayer("C");
    session.addPlayer(a);
    session.addPlayer(b);
    session.addPlayer(c);
    session.start();

    expect(session.currentTurn?.playerId).toBe(a.id);
    session.submitAction({ type: "end_turn", playerId: a.id });
    expect(session.currentTurn?.number).toBe(2);
    expect(session.currentTurn?.playerId).toBe(b.id);
    session.submitAction({ type: "end_turn", playerId: b.id });
    expect(session.currentTurn?.playerId).toBe(c.id);
  });

  it("rejects an out-of-order action", () => {
    const session = createSession();
    const a = createPlayer("A");
    const b = createPlayer("B");
    session.addPlayer(a);
    session.addPlayer(b);
    session.start();
    expect(session.currentTurn?.playerId).toBe(a.id);
    expect(() =>
      session.submitAction({ type: "end_turn", playerId: b.id }),
    ).toThrow(GameError);
  });

  it("allows a player to leave during the lobby", () => {
    const session = createSession();
    const player = createPlayer("A");
    session.addPlayer(player);
    session.removePlayer(player.id);
    expect(session.playerCount).toBe(0);
  });

  it("prevents leaving an active session", () => {
    const session = createSession();
    const a = createPlayer("A");
    const b = createPlayer("B");
    session.addPlayer(a);
    session.addPlayer(b);
    session.start();
    expect(() => session.removePlayer(a.id)).toThrow(GameError);
  });
});
