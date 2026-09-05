import type { RealtimeTransport } from "../transport";

/**
 * Seam for a *distributed* realtime transport for a multi-instance deployment
 * (Vercel serverless). It extends the provider-independent {@link RealtimeTransport}
 * with presence and channel lifecycle primitives that a distributed hub must
 * back with shared state.
 *
 * The game/rules layer stays independent of any provider — a concrete
 * implementation (Ably, Pusher, Supabase Realtime, Liveblocks, or a managed
 * WebSocket service) is injected behind this interface at the server boundary.
 *
 * Trade-offs (documented, not here): provider choice depends on concurrency,
 * presence needs, retention for reconnect replay, and Vercel serverless limits.
 * See docs/MULTIPLAYER.md.
 */
export interface DistributedRealtimeTransport extends RealtimeTransport {
  /** Join a room channel for a connection; provider tracks membership. */
  joinRoomChannel(roomId: string, connectionId: string, meta?: unknown): Promise<void>;
  /** Leave a room channel; provider evicts the connection. */
  leaveRoomChannel(roomId: string, connectionId: string): Promise<void>;
  /** Snapshot of current presence (connected connections) for a room. */
  presence(roomId: string): Promise<unknown[]>;
  /** Shut down the provider client (graceful teardown). */
  close(): Promise<void>;
}
