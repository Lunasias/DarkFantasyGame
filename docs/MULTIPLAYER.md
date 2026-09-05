# Multiplayer Foundation

This document describes the Phase 1 multiplayer architecture. It covers
authentication, the room lifecycle, the room state machine, the realtime
transport, the event model, the reconnect strategy, authorization rules, and
the concurrency strategy.

Everything here is server-authoritative: the client never supplies its user id,
host id, room owner, slot, status, ready state, or player count. The server
derives identity from the authenticated session and the database determines the
rest (see [Security](#security)).

## Authentication

- **Approach:** email + password accounts with server-side sessions.
- **Hashing:** `bcryptjs` (pure JS, no native build) at cost 12. Only the hash is
  stored on `users.password_hash`.
- **Session:** a random 256-bit opaque token is returned and stored as an
  `httpOnly`, `SameSite=lax` cookie named `dfg_session`. Only its
  SHA-256 hash is persisted in `sessions.token_hash`, so a DB leak cannot be
  replayed as a live cookie.
- **Identity:** every protected operation calls `requireUser()` (reads the
  cookie, validates the session hash, resolves the user). The user id is always
  derived server-side — never from the request body.
- **Endpoints / actions:** `registerAction`, `loginAction`, `logoutAction`,
  `getMeAction`, plus `GET /api/me`.
- **Config:** no credentials in code; see `.env.example` / `DATABASE_URL`.

## Room lifecycle

A `Room` is a pre-game lobby. Its lifecycle is a formal state machine (below).
Operations: `create`, `join`, `leave`, `setReady`, `kick`, `transferHost`,
`startGame`, and presence (`setConnected`).

## Room state machine

```
waiting → starting → in_game → finished → closed
   │         │          │            │
   └─────────┴──────────┴────────────┴──→ closed
```

Legal transitions (enforced in `src/game/room/state-machine.ts` and re-used by
the authoritative server service):

- `waiting → starting` (host, all ready, ≥2 players)
- `waiting → closed` (emptied)
- `starting → in_game` (game session row created)
- `starting → closed`
- `in_game → finished`
- `finished → closed`

A room is **joinable only while `waiting`**. Any illegal transition throws a typed
`RoomError("INVALID_ROOM_STATE")`.

## Authoritative room application service

`src/server/room/room-app-service.ts` is the single authoritative path. Every
mutation:

1. runs inside a `db.transaction(...)`,
2. derives identity from the authenticated actor,
3. validates membership, host permissions, and the state machine server-side,
4. relies on DB unique constraints + idempotent retry for safety,
5. appends a server-sequenced room event,
6. broadcasts the event + an authoritative snapshot through the realtime
   transport.

The `Room` domain object is thin and re-used by the domain and unit tests; the
server layer owns persistence. The transport is **never** the source of truth.

## Realtime architecture

`src/server/transport.ts` defines the provider-independent `RealtimeTransport`
interface:

```ts
publishRoomEvent(roomId, event)
publishRoomSnapshot(roomId, snapshot)
subscribeRoom(roomId, subscriber) → unsubscribe
```

- **Dev/process-local implementation:** `InMemoryRealtimeTransport`
  (`src/server/realtime/in-memory.ts`) is a hub used by a single Next instance
  and by tests.
- **Client subscription:** `GET /api/rooms/:roomCode/stream` is an SSE stream
  that authenticates, verifies membership, streams the authoritative snapshot +
  any missed events, then streams live room events. The client hook
  `useRoomStream` renders from these snapshots (no database polling).
- **Production swap:** on Vercel (multi-instance, serverless) the same
  interface is backed by a distributed transport (managed WebSocket/pub-sub or a
  Vercel-compatible provider). The application service and SSE client do not
  change.

## Event model

Room events are persisted in `room_events` with an id, actor, type, payload,
server-assigned monotonic `sequence` (unique per room), and timestamp. Clients
never submit a sequence. Types:

`ROOM_PLAYER_JOINED`, `ROOM_PLAYER_LEFT`, `ROOM_PLAYER_READY_CHANGED`,
`ROOM_PLAYER_CONNECTED`, `ROOM_PLAYER_DISCONNECTED`, `ROOM_HOST_CHANGED`,
`ROOM_STATE_CHANGED`, `GAME_STARTED`.

Game-session events live in `game_events` (with `state_version` on
`game_sessions`).

## Reconnect foundation

`setConnected(actor, connected)` updates `connected` + `last_seen_at` without
removing the seat. `reconnectState` returns the current authoritative snapshot
plus all events after the client's last acknowledged sequence. The SSE endpoint
delivers the same on connect via the `since` query param.

## Authorization rules

- A user may only read a room they are a member of (`getRoom` enforces
  membership — IDOR guard).
- Only the host may `start`, `kick`, or `transferHost` (`NOT_HOST` otherwise).
- Only members may `setReady`/`leave`/`join`; a joined user can never be a
  duplicate (`ALREADY_IN_ROOM`).
- A room never exceeds `max_players` (`ROOM_FULL`).

## Concurrency strategy

Correctness under duplicate + concurrent requests is guaranteed by **database
constraints** plus idempotent retry, not by optimistic client logic:

- `UNIQUE(room_id, user_id)` → a player can never occupy two seats.
- `UNIQUE(room_id, slot)` → only `max_players` distinct slots exist, so the room
  cannot exceed capacity (`slot ∈ [0, max_players)`).
- `UNIQUE(room_code)` → join codes are unique.
- `appendRoomEvent` computes the next `sequence` inside the transaction and the
  `UNIQUE(room_id, sequence)` index rejects any duplicate.

Duplicate/retry handling: `join` and `create` retry on unique-violation;
`join`/`ready`/`start` are **idempotent** (already a member → no-op; already
started → reuse the session). Combined with the constraints, two simultaneous
joins into the last slot yield exactly one successful membership and never
exceed the cap.

## Security

- No user id / host id / room owner / slot / status / ready from the client.
- Identity is server-derived from the session cookie (session token hashed).
- IDOR: non-members cannot read a room.
- SQL injection: all queries go through Drizzle's parameterized builder.
- Errors are mapped to typed `AppError` codes; DB stack traces are never
  returned to clients.
- Rate limiting: `RateLimiter` abstraction + in-memory dev implementation,
  applied to auth + room mutations.

## Database transactions

Critical mutations run in `db.transaction(...)`. Create room = insert room +
insert host membership atomically. Join = verify + allocate slot + insert
membership atomically. Leave = remove membership + (host) reassign + (empty)
close atomically. Start = `waiting → starting`, create session, `starting →
in_game` atomically.

> **Environment note:** Phase 1 was validated against the domain rules, the
> generated schema constraints (raw SQL), and the type-checked Drizzle layer.
> Running the full DB-backed flow requires a real Postgres/Neon instance
> (`DATABASE_URL`); the local dev daemon serves pages but DB-backed auth/room
> operations require a configured database.

## Authentication lifecycle (Phase 1.5)

- **Hashing:** `bcryptjs` cost 12 in `users.password_hash`.
- **Token:** 256-bit random; only its SHA-256 hash is stored (`sessions.token_hash`).
- **Cookie:** `dfg_session`, `httpOnly`, `sameSite=lax`, `path=/`, `secure` in
  production, `maxAge` = session duration.
- **Expiration:** 7 days; `isSessionExpired(expiresAt, now)` (pure policy) is
  checked on every validate; the expired session is deleted.
- **Revocation/logout:** `logout` deletes the session row + clears the cookie.
- **Rotation:** a brand new token is issued on every `login`/`register` (a stale
  pre-auth cookie is never reused), so there is no session-fixation window.
- **Cleanup:** `pruneExpiredSessions()` removes all expired rows (safe to run
  from a scheduled task); `validate` also deletes the single session it rejects.
- **Brute force / enumeration:** login returns a single generic message for
  unknown-email vs wrong-password, and performs a dummy bcrypt comparison for
  unknown users so response timing does not reveal account existence. Both
  `login` and `register` are rate-limited by a per-client key (client IP).
- **CSRF:** Next.js server actions enforce Origin checks by default; the
  state-changing cookie is `SameSite=Lax`. (A production fallback could add an
  explicit CSRF token.)
- **Trade-off (documented):** `register` reports a duplicate email with a
  specific message; this is a known account-enumeration vector, mitigated by
  per-client rate limiting rather than hiding the message.

## Distributed realtime design (Phase 1.5)

The provider-independent `RealtimeTransport` is the client-facing seam. For a
multi-instance / serverless deployment the application injects a
`DistributedRealtimeTransport` (see `src/server/realtime/distributed.ts`), which
adds `joinRoomChannel`, `leaveRoomChannel`, `presence`, and `close` on top of
publish/subscribe + event fan-out to room channels.

**Recommended options and trade-offs (design only — no provider wired up yet):**

| Option | Pros | Cons |
| --- | --- | --- |
| Managed provider (Ably / Pusher / Liveblocks) | Low ops, presence + retention + reconnect built in | Vendor dependency/cost |
| Postgres-backed pub/sub (LISTEN/NOTIFY) | Reuses existing Neon, no new infra | Not reliable across serverless scale; no cross-instance presence |
| Vercel Native/WebSocket provider | Fits the platform | Platform-bound, still a service to configure |
| Self-hosted WS/Socket.IO | Full control | Needs a long-running process (not Vercel functions) |

**Current vs not-yet:**

- **CURRENT:** a single-process in-memory transport + SSE stream works (dev +
  tests). Only authorized room members can subscribe; the server assigns event
  sequences; clients cannot publish authoritative state.
- **NOT YET:** multi-instance distributed realtime and distributed presence.
  Do not treat the in-memory transport as production distributed realtime.

## Rate limiting (Phase 1.5)

- **Implemented:** `RateLimiter` interface + `InMemoryRateLimiter`
  (sliding-window counter, per-key). Applied to login, register, room create/
  join/ready/kick/host/start/read, and SSE connection attempts.
- **Scope:** **development / single-process only.** It is not shared across
  serverless instances, so it is not a production distributed rate limiter.
- **Production:** substitute a distributed limiter (Vercel KV / Upstash /
  Redis) behind the same interface. Do not claim distributed limiting from the
  in-memory implementation.

## Concurrency guarantees (Phase 1.5)

Correctness under duplicate/concurrent requests is derived from **database
constraints** and **idempotent retry**, not client logic:

- `UNIQUE(room_id, user_id)` → no duplicate seats.
- `UNIQUE(room_id, slot)` → capacity is bounded by the number of slots.
- `UNIQUE(room_code)` → join codes are unique.
- `UNIQUE(room_id, sequence)` → server-assigned event ordering is stable.
- Mutations run in `db.transaction(...)`; `join`/`create` retry on violation;
  `join`/`ready`/`start` are idempotent.

**Unprovable here:** true *concurrent* PostgreSQL behavior (two simultaneous
joins racing a `SELECT`+`INSERT`) cannot be exercised without a real Neon/
Postgres instance, so no results are claimed for that. The guarantees above are
enforced by the schema constraints themselves, which are validated
deterministically by `tests/db/constraints.test.ts` against the generated
schema.

## Security model (summary)

Identity, host, room, slot, status, ready, and count are all server-derived;
the client supplies none of them. Every room read/SSE requires membership;
host-only operations are enforced server-side (see
`src/server/room/authorization.ts` + `RoomAppService`). SQL injection is
prevented by parameterized Drizzle queries; errors map to typed `AppError`
codes and never leak SQL/stack/paths/secrets.

## Remaining production requirements

- Configure `DATABASE_URL` (Neon) and run `pnpm db:migrate`.
- Substitute a distributed realtime transport + presence (multi-instance).
- Substitute a distributed rate limiter (production).
- Optional: explicit CSRF token, email verification, and refresh-token rotation.
- Load-test concurrent joins/starts against a real Postgres instance.
