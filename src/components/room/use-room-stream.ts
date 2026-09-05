"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@/types/room";
import type { RealtimeEvent } from "@/server/realtime/types";

interface StreamMessage {
  kind: "room_snapshot" | "room_event";
  roomId: string;
  snapshot?: RoomView;
  event?: unknown;
}

/**
 * Connects to the room SSE stream and keeps the authoritative snapshot in sync.
 * The snapshot is always server-generated; events are surfaced for the event
 * log. Reconnecting is handled natively by EventSource.
 */
export function useRoomStream(roomCode: string) {
  const roomRef = useRef<RoomView | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    const url = `/api/rooms/${encodeURIComponent(roomCode)}/stream`;
    const source = new EventSource(url);

    const handleSnapshot = (message: StreamMessage) => {
      if (message.snapshot) {
        roomRef.current = message.snapshot;
        setRoom(message.snapshot);
      }
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener("snapshot", (e) => {
      handleSnapshot(JSON.parse((e as MessageEvent).data) as StreamMessage);
    });

    source.addEventListener("message", (e) => {
      const message = JSON.parse((e as MessageEvent).data) as StreamMessage;
      if (message.kind === "room_snapshot") {
        handleSnapshot(message);
      } else if (message.kind === "room_event") {
        setEvents((prev) => [...prev, message as RealtimeEvent]);
      }
    });

    return () => {
      source.close();
      setConnected(false);
    };
  }, [roomCode]);

  return { room, connected, events };
}
