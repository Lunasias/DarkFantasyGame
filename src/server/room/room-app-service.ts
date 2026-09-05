import { and, count, eq } from "drizzle-orm";
import type { Db } from "../../db";
import {
  appendRoomEvent,
  getRoomView,
  getRoomViewByCode,
  listRoomEventsAfter,
} from "../../db/room-store";
import { isUniqueViolation } from "../../db/util";
import { gameSessions } from "../../db/schema/game-sessions";
import { roomPlayers } from "../../db/schema/room-players";
import { rooms } from "../../db/schema/rooms";
import { createId } from "../../game/engine/id";
import { RoomError } from "../../game/room/errors";
import { generateRoomCode } from "../../game/room/code";
import { assertTransition } from "../../game/room/state-machine";
import { MIN_PLAYERS } from "../../game/room/types";
import type { AuthUser } from "../../lib/auth/auth-service";
import { AppError } from "../errors";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import type { RealtimeTransport } from "../transport";
import type {
  RoomEventView,
  RoomJoinPreview,
  RoomView,
} from "../../types/room";
import type {
  CreateRoomInput,
  JoinRoomInput,
  KickInput,
  ReadyInput,
  ReconnectInput,
  RoomIdInput,
  TransferHostInput,
} from "./schemas";

export interface StartGameResult {
  room: RoomView;
  gameSessionId: string;
}

const JOIN_RETRIES = 4;

/**
 * Authoritative room application service.
 *
 * Every mutation:
 *  - runs inside a DB transaction,
 *  - derives identity from the authenticated actor (never client-supplied),
 *  - validates host permissions and the room state machine server-side,
 *  - relies on DB unique constraints (membership + slot) and idempotent retry
 *    to stay safe under duplicate and concurrent requests,
 *  - appends a server-sequenced room event and broadcasts a snapshot + event
 *    through the provider-independent {@link RealtimeTransport}.
 *
 * The transport is never the source of truth — the database and this service
 * remain authoritative.
 */
export class RoomAppService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeTransport,
    private readonly rateLimiter?: RateLimiter,
  ) {}

  async createRoom(actor: AuthUser, input: CreateRoomInput): Promise<RoomView> {
    await this.limit(`room:create:${actor.id}`);

    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { roomId } = await this.db.transaction<
          { roomId: string }
        >(async (tx) => {
          const exec = tx as unknown as Db;
          const roomId = createId();
          const code = generateRoomCode();
          await exec.insert(rooms).values({
            id: roomId,
            roomCode: code,
            name: input.name,
            hostUserId: actor.id,
            status: "waiting",
            maxPlayers: input.maxPlayers ?? 4,
            gameMode: input.gameMode ?? "standard",
            ruleset: input.ruleset ?? "classic",
            visibility: input.visibility ?? "public",
          });

          await exec.insert(roomPlayers).values({
            roomId,
            userId: actor.id,
            slot: 0,
            ready: false,
            isHost: true,
            connected: true,
          });

          await appendRoomEvent(exec, {
            roomId,
            actorId: actor.id,
            type: "ROOM_STATE_CHANGED",
            payload: { status: "waiting" },
          });
          return { roomId };
        });
        return this.publish(roomId, []);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new RoomError("INVALID_ACTION", "Could not allocate a room code");
  }

  async joinRoom(actor: AuthUser, input: JoinRoomInput): Promise<RoomView> {
    await this.limit(`room:join:${actor.id}`);
    const code = input.roomCode;

    for (let attempt = 0; attempt < JOIN_RETRIES; attempt++) {
      try {
        const { roomId, events } = await this.db.transaction<
          { roomId: string; events: RoomEventView[] }
        >(async (tx) => {
          const exec = tx as unknown as Db;

          const [room] = await exec
            .select()
            .from(rooms)
            .where(eq(rooms.roomCode, code))
            .limit(1);
          if (!room) {
            throw new RoomError("ROOM_NOT_FOUND", "Room not found");
          }

          const existing = await exec
            .select({ userId: roomPlayers.userId })
            .from(roomPlayers)
            .where(
              and(
                eq(roomPlayers.roomId, room.id),
                eq(roomPlayers.userId, actor.id),
              ),
            )
            .limit(1);

          // Idempotent: already a member → no-op, just return current state.
          if (existing.length > 0) {
            return { roomId: room.id, events: [] };
          }

          if (room.status !== "waiting") {
            throw new RoomError(
              "ROOM_NOT_JOINABLE",
              `Room is not joinable in state ${room.status}`,
            );
          }

          const [{ count: memberCount }] = await exec
            .select({ count: count() })
            .from(roomPlayers)
            .where(eq(roomPlayers.roomId, room.id));
          if (memberCount >= room.maxPlayers) {
            throw new RoomError("ROOM_FULL", `Room is full (${room.maxPlayers})`);
          }

          const slot = await this.allocateSlot(exec, room.id);
          await exec.insert(roomPlayers).values({
            roomId: room.id,
            userId: actor.id,
            slot,
            ready: false,
            isHost: false,
            connected: true,
          });

          const event = await appendRoomEvent(exec, {
            roomId: room.id,
            actorId: actor.id,
            type: "ROOM_PLAYER_JOINED",
            payload: { userId: actor.id, slot },
          });
          return { roomId: room.id, events: [event] };
        });

        return this.publish(roomId, events);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new RoomError("ROOM_FULL", "Room became full while joining");
  }

  async leaveRoom(actor: AuthUser, input: RoomIdInput): Promise<RoomView> {
    await this.limit(`room:leave:${actor.id}`);
    const { roomId, events } = await this.db.transaction<
      { roomId: string; events: RoomEventView[] }
    >(async (tx) => {
      const exec = tx as unknown as Db;
      const roomId = input.roomId;

      const [room] = await exec
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");

      const member = await exec
        .select()
        .from(roomPlayers)
        .where(
          and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, actor.id)),
        )
        .limit(1);
      if (!member.length) {
        throw new RoomError("NOT_IN_ROOM", "You are not in this room");
      }
      if (room.status !== "waiting" && room.status !== "finished") {
        throw new RoomError(
          "INVALID_ROOM_STATE",
          "Players can only leave while the room is in the lobby",
        );
      }

      const wasHost = member[0].isHost;
      await exec
        .delete(roomPlayers)
        .where(
          and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, actor.id)),
        );

      const [{ count: remaining }] = await exec
        .select({ count: count() })
        .from(roomPlayers)
        .where(eq(roomPlayers.roomId, roomId));

      const events: RoomEventView[] = [];
      if (remaining === 0) {
        assertTransition(room.status, "closed");
        await exec.update(rooms).set({ status: "closed" }).where(eq(rooms.id, roomId));
        events.push(
          await appendRoomEvent(exec, {
            roomId,
            actorId: actor.id,
            type: "ROOM_STATE_CHANGED",
            payload: { status: "closed" },
          }),
        );
      } else {
        events.push(
          await appendRoomEvent(exec, {
            roomId,
            actorId: actor.id,
            type: "ROOM_PLAYER_LEFT",
            payload: { userId: actor.id },
          }),
        );
        if (wasHost) {
          const newHost = await this.promoteNextHost(exec, roomId);
          events.push(
            await appendRoomEvent(exec, {
              roomId,
              actorId: actor.id,
              type: "ROOM_HOST_CHANGED",
              payload: { hostId: newHost },
            }),
          );
        }
      }
      return { roomId, events };
    });
    return this.publish(roomId, events);
  }

  async setReady(actor: AuthUser, input: ReadyInput): Promise<RoomView> {
    await this.limit(`room:ready:${actor.id}`);
    const { roomId, events } = await this.db.transaction<
      { roomId: string; events: RoomEventView[] }
    >(async (tx) => {
      const exec = tx as unknown as Db;

      const [room] = await exec
        .select({ id: rooms.id, status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");

      const member = await exec
        .select()
        .from(roomPlayers)
        .where(
          and(
            eq(roomPlayers.roomId, input.roomId),
            eq(roomPlayers.userId, actor.id),
          ),
        )
        .limit(1);
      if (!member.length) {
        throw new RoomError("NOT_IN_ROOM", "You are not in this room");
      }
      if (room.status !== "waiting") {
        throw new RoomError(
          "INVALID_ROOM_STATE",
          "Readiness can only change while the room is waiting",
        );
      }

      await exec
        .update(roomPlayers)
        .set({ ready: input.ready })
        .where(eq(roomPlayers.id, member[0].id));

      const event = await appendRoomEvent(exec, {
        roomId: input.roomId,
        actorId: actor.id,
        type: "ROOM_PLAYER_READY_CHANGED",
        payload: { userId: actor.id, ready: input.ready },
      });
      return { roomId: input.roomId, events: [event] };
    });
    return this.publish(roomId, events);
  }

  async kickPlayer(actor: AuthUser, input: KickInput): Promise<RoomView> {
    await this.limit(`room:kick:${actor.id}`);
    const { roomId, events } = await this.db.transaction<
      { roomId: string; events: RoomEventView[] }
    >(async (tx) => {
      const exec = tx as unknown as Db;
      const [room] = await exec
        .select()
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
      if (room.status !== "waiting") {
        throw new RoomError(
          "INVALID_ROOM_STATE",
          "Players can only be removed while the room is waiting",
        );
      }
      await this.assertHost(exec, input.roomId, actor.id);
      if (input.targetUserId === actor.id) {
        throw new RoomError("INVALID_ACTION", "The host cannot kick themselves");
      }
      const target = await exec
        .select()
        .from(roomPlayers)
        .where(
          and(
            eq(roomPlayers.roomId, input.roomId),
            eq(roomPlayers.userId, input.targetUserId),
          ),
        )
        .limit(1);
      if (!target.length) {
        throw new RoomError("PLAYER_NOT_FOUND", "Target player is not in this room");
      }

      await exec
        .delete(roomPlayers)
        .where(eq(roomPlayers.id, target[0].id));

      const event = await appendRoomEvent(exec, {
        roomId: input.roomId,
        actorId: actor.id,
        type: "ROOM_PLAYER_LEFT",
        payload: { userId: input.targetUserId, kicked: true },
      });
      return { roomId: input.roomId, events: [event] };
    });
    return this.publish(roomId, events);
  }

  async transferHost(
    actor: AuthUser,
    input: TransferHostInput,
  ): Promise<RoomView> {
    await this.limit(`room:host:${actor.id}`);
    const { roomId, events } = await this.db.transaction<
      { roomId: string; events: RoomEventView[] }
    >(async (tx) => {
      const exec = tx as unknown as Db;
      const [room] = await exec
        .select()
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
      if (room.status !== "waiting") {
        throw new RoomError(
          "INVALID_ROOM_STATE",
          "Host can only be transferred while the room is waiting",
        );
      }
      await this.assertHost(exec, input.roomId, actor.id);
      await this.requireMember(exec, input.roomId, input.targetUserId);

      await exec
        .update(roomPlayers)
        .set({ isHost: false })
        .where(
          and(
            eq(roomPlayers.roomId, input.roomId),
            eq(roomPlayers.isHost, true),
          ),
        );
      await exec
        .update(roomPlayers)
        .set({ isHost: true })
        .where(
          and(
            eq(roomPlayers.roomId, input.roomId),
            eq(roomPlayers.userId, input.targetUserId),
          ),
        );
      await exec
        .update(rooms)
        .set({ hostUserId: input.targetUserId })
        .where(eq(rooms.id, input.roomId));

      const event = await appendRoomEvent(exec, {
        roomId: input.roomId,
        actorId: actor.id,
        type: "ROOM_HOST_CHANGED",
        payload: { hostId: input.targetUserId },
      });
      return { roomId: input.roomId, events: [event] };
    });
    return this.publish(roomId, events);
  }

  async startGame(actor: AuthUser, input: RoomIdInput): Promise<StartGameResult> {
    await this.limit(`room:start:${actor.id}`);
    const { roomId, events, sessionId } = await this.db.transaction<
      { roomId: string; events: RoomEventView[]; sessionId: string }
    >(async (tx) => {
      const exec = tx as unknown as Db;
      const [room] = await exec
        .select()
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");

      // Idempotent: game already starting/in game → reuse the existing session.
      if (room.status === "starting" || room.status === "in_game") {
        const [existing] = await exec
          .select()
          .from(gameSessions)
          .where(eq(gameSessions.roomId, room.id))
          .limit(1);
        return {
          roomId: room.id,
          events: [],
          sessionId: existing?.id ?? "",
        };
      }

      await this.assertHost(exec, room.id, actor.id);
      if (room.status !== "waiting") {
        throw new RoomError(
          "INVALID_ROOM_STATE",
          "A game can only start from the waiting state",
        );
      }
      const { allReady } = await this.readiness(exec, room.id);
      if (!allReady || room.maxPlayers < MIN_PLAYERS) {
        throw new RoomError(
          "INSUFFICIENT_PLAYERS",
          "Cannot start: all players must be ready and at least 2 must be seated",
        );
      }

      assertTransition("waiting", "starting");
      await exec.update(rooms).set({ status: "starting" }).where(eq(rooms.id, room.id));

      const sessionId = createId();
      await exec.insert(gameSessions).values({
        id: sessionId,
        roomId: room.id,
        phase: "lobby",
        stateVersion: 0,
      });

      assertTransition("starting", "in_game");
      await exec.update(rooms).set({ status: "in_game" }).where(eq(rooms.id, room.id));

      const started = await appendRoomEvent(exec, {
        roomId: room.id,
        actorId: actor.id,
        type: "GAME_STARTED",
        payload: { gameSessionId: sessionId },
      });
      return { roomId: room.id, events: [started], sessionId };
    });

    const view = await this.publish(roomId, events);
    return { room: view, gameSessionId: sessionId };
  }

  async setConnected(
    actor: AuthUser,
    input: ReconnectInput,
  ): Promise<RoomView> {
    const { roomId, events } = await this.db.transaction<
      { roomId: string; events: RoomEventView[] }
    >(async (tx) => {
      const exec = tx as unknown as Db;
      const [room] = await exec
        .select()
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1);
      if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
      const member = await exec
        .select()
        .from(roomPlayers)
        .where(
          and(
            eq(roomPlayers.roomId, input.roomId),
            eq(roomPlayers.userId, actor.id),
          ),
        )
        .limit(1);
      if (!member.length) {
        throw new RoomError("NOT_IN_ROOM", "You are not in this room");
      }
      await exec
        .update(roomPlayers)
        .set({ connected: input.connected, lastSeenAt: new Date() })
        .where(eq(roomPlayers.id, member[0].id));

      const event = await appendRoomEvent(exec, {
        roomId: input.roomId,
        actorId: actor.id,
        type: input.connected ? "ROOM_PLAYER_CONNECTED" : "ROOM_PLAYER_DISCONNECTED",
        payload: { userId: actor.id },
      });
      return { roomId: input.roomId, events: [event] };
    });
    return this.publish(roomId, events);
  }

  /** Full room view — only members may read it (IDOR guard). */
  async getRoom(actor: AuthUser, input: RoomIdInput): Promise<RoomView> {
    await this.limit(`room:read:${actor.id}`);
    const view = await getRoomView(this.db, input.roomId);
    if (!view) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
    await this.requireMember(this.db, input.roomId, actor.id);
    return view;
  }

  /** Public, member-safe preview for the join-by-code screen. */
  async joinPreview(code: string): Promise<RoomJoinPreview> {
    const view = await getRoomViewByCode(this.db, code.toUpperCase());
    if (!view) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
    const canJoin =
      view.status === "waiting" && view.players.length < view.maxPlayers;
    return {
      code: view.code,
      name: view.name,
      status: view.status,
      maxPlayers: view.maxPlayers,
      playerCount: view.players.length,
      visibility: view.visibility,
      canJoin,
    };
  }

  /** Reconnect foundation: current state + events this actor missed. */
  async reconnectState(
    actor: AuthUser,
    input: { roomId: string; lastSequence: number },
  ): Promise<{ snapshot: RoomView; missed: RoomEventView[] }> {
    const view = await this.getRoom(actor, { roomId: input.roomId });
    const missed = await this.listEventsAfter(
      this.db,
      input.roomId,
      input.lastSequence,
    );
    return { snapshot: view, missed };
  }

  // ---- private helpers (all run against an executor, possibly a tx) ----

  private async publish(
    roomId: string,
    events: RoomEventView[],
  ): Promise<RoomView> {
    const view = await getRoomView(this.db, roomId);
    if (!view) {
      throw new RoomError("ROOM_NOT_FOUND", "Room not found");
    }
    for (const event of events) {
      await this.realtime.publishRoomEvent(roomId, event);
    }
    await this.realtime.publishRoomSnapshot(roomId, view);
    return view;
  }

  private async allocateSlot(
    executor: Db,
    roomId: string,
  ): Promise<number> {
    const slots = await executor
      .select({ slot: roomPlayers.slot })
      .from(roomPlayers)
      .where(eq(roomPlayers.roomId, roomId));
    const used = new Set(slots.map((s) => s.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    return slot;
  }

  private async assertHost(
    executor: Db,
    roomId: string,
    actorId: string,
  ): Promise<void> {
    const [room] = await executor
      .select({ hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    if (!room || room.hostUserId !== actorId) {
      throw new RoomError("NOT_HOST", "Only the host can perform this action");
    }
  }

  private async requireMember(
    executor: Db,
    roomId: string,
    userId: string,
  ): Promise<void> {
    const rows = await executor
      .select({ userId: roomPlayers.userId })
      .from(roomPlayers)
      .where(
        and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, userId)),
      )
      .limit(1);
    if (!rows.length) {
      throw new RoomError("NOT_IN_ROOM", "Player is not in this room");
    }
  }

  private async readiness(
    executor: Db,
    roomId: string,
  ): Promise<{ allReady: boolean }> {
    const rows = await executor
      .select({ ready: roomPlayers.ready })
      .from(roomPlayers)
      .where(eq(roomPlayers.roomId, roomId));
    return { allReady: rows.length > 0 && rows.every((r) => r.ready) };
  }

  private async promoteNextHost(executor: Db, roomId: string): Promise<string> {
    const members = await executor
      .select({ userId: roomPlayers.userId })
      .from(roomPlayers)
      .where(eq(roomPlayers.roomId, roomId))
      .orderBy(roomPlayers.slot);
    const next = members[0]?.userId;
    if (!next) return "";

    await executor
      .update(roomPlayers)
      .set({ isHost: true })
      .where(
        and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, next)),
      );
    await executor
      .update(rooms)
      .set({ hostUserId: next })
      .where(eq(rooms.id, roomId));
    return next;
  }

  private async listEventsAfter(
    executor: Db,
    roomId: string,
    afterSequence: number,
  ): Promise<RoomEventView[]> {
    return listRoomEventsAfter(executor, roomId, afterSequence);
  }

  private async limit(key: string): Promise<void> {
    if (!this.rateLimiter) return;
    const result = await this.rateLimiter.consume(key, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!result.allowed) {
      throw new AppError("RATE_LIMITED", "Too many requests, please slow down");
    }
  }
}
