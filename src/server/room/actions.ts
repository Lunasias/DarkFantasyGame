"use server";

import type { ApiResult } from "../../types";
import type { RoomJoinPreview, RoomView } from "../../types/room";
import { requireUser } from "../../lib/auth/session";
import { assertValid, runAction } from "../../lib/result";
import {
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  readySchema,
  reconnectSchema,
  roomIdSchema,
  transferHostSchema,
} from "./schemas";
import { getRoomAppService } from "./service";
import type { StartGameResult } from "./room-app-service";

export async function createRoomAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(createRoomSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.createRoom(user, parsed);
  });
}

export async function joinRoomAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(joinRoomSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.joinRoom(user, parsed);
  });
}

export async function leaveRoomAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(roomIdSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.leaveRoom(user, parsed);
  });
}

export async function setReadyAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(readySchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.setReady(user, parsed);
  });
}

export async function kickPlayerAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(kickSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.kickPlayer(user, parsed);
  });
}

export async function transferHostAction(
  input: unknown,
): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(transferHostSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.transferHost(user, parsed);
  });
}

export async function startGameAction(input: unknown): Promise<ApiResult<StartGameResult>> {
  return runAction(async () => {
    const parsed = assertValid(roomIdSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.startGame(user, parsed);
  });
}

export async function setConnectedAction(
  input: unknown,
): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(reconnectSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.setConnected(user, parsed);
  });
}

export async function getRoomAction(input: unknown): Promise<ApiResult<RoomView>> {
  return runAction(async () => {
    const parsed = assertValid(roomIdSchema, input);
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.getRoom(user, parsed);
  });
}

export async function getRoomPreviewAction(
  roomCode: string,
): Promise<ApiResult<RoomJoinPreview>> {
  return runAction(async () => {
    const user = await requireUser();
    void user;
    const service = await getRoomAppService();
    return service.joinPreview(roomCode);
  });
}

export async function reconnectStateAction(
  input: unknown,
): Promise<ApiResult<{ snapshot: RoomView; missed: unknown[] }>> {
  return runAction(async () => {
    const parsed = assertValid(
      { parse: (v: unknown) => v as { roomId: string; lastSequence: number } },
      input,
    );
    const user = await requireUser();
    const service = await getRoomAppService();
    return service.reconnectState(user, parsed);
  });
}
