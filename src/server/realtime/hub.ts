import type { RealtimeTransport } from "../transport";
import { createRealtimeTransport } from "./in-memory";

let transport: RealtimeTransport | null = null;

/** Singleton realtime transport for a single server process. */
export function getRealtimeTransport(): RealtimeTransport {
  if (!transport) {
    transport = createRealtimeTransport();
  }
  return transport;
}

/** Test hook: inject or clear the shared transport. */
export function setRealtimeTransport(value: RealtimeTransport | null): void {
  transport = value;
}
