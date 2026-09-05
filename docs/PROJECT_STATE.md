# Project State

## Current phase

**Phase 1 — Multiplayer Foundation** (implemented; being finalized & committed)

Phase 0 (Foundation) is complete and committed. This document tracks Phase 1.

## Completed work

- **Authentication** — email/password accounts (`bcryptjs`), server-side
  sessions (hashed opaque tokens, `httpOnly`/`SameSite=lax` cookie), server
  actions (`registerAction`/`loginAction`/`logoutAction`/`getMeAction`),
  `GET /api/me`, `requireUser()`/`getCurrentUser()` for protected actions.
- **Room state machine** — formal `waiting → starting → in_game → finished →
  closed` transitions in `src/game/room/state-machine.ts`; `Room` domain updated
  to join/leave/ready/kick/transfer-host/start/begin-game/close, slot
  allocation, presence flags.
- **Authoritative room service** — `src/server/room/room-app-service.ts` with
  transactional create/join/leave/setReady/kick/transferHost/startGame plus
  presence/reconnect and IDOR-guarded reads. Re-uses the domain state machine.
- **Realtime** — preserved provider-independent `RealtimeTransport`; an
  in-memory implementation + hub for dev/tests; SSE stream
  (`/api/rooms/[roomCode]/stream`) with auth + membership checks + replay; a
  client `useRoomStream` hook. The transport is never authoritative.
- **Event model** — `room_events` table with server-assigned monotonic
  sequences; typed event types (join/leave/ready/connected/host/state/start).
- **Idempotency + concurrency** — unique constraints
  (`(room,user)`, `(room,slot)`, `room_code`) + retry-on-violation + idempotent
  join/ready/start.
- **Errors** — `AppError` codes (UNAUTHENTICATED, UNAUTHORIZED, ROOM_NOT_FOUND,
  ROOM_FULL, ROOM_NOT_JOINABLE, ALREADY_IN_ROOM, NOT_IN_ROOM, NOT_HOST,
  INVALID_ROOM_STATE, INVALID_ACTION, PLAYER_NOT_FOUND, RATE_LIMITED …) with safe
  mapping from domain errors; no DB stacks leak.
- **Rate limiting** — `RateLimiter` abstraction + in-memory dev implementation.
- **Schema** — added `sessions`, `room_events`; added `room_code` (unique),
  `slot`/`connected`/`last_seen_at`/`profile_id` to room_players,
  `state_version` to game_sessions, `password_hash` to users; new
  `session_phase`/`room_visibility` enums. Migration `0001_*` generated;
  `src/db/schema.sql` snapshot for the in-memory bootstrap.
- **UI** — `/login`, `/register`, `/lobby`, `/rooms/create`, `/rooms/[roomCode]`;
  the room lobby reacts to realtime snapshots (no polling).
- **Tests** — domain/unit/integration (state machine, room lifecycle,
  authorization, slots, readiness), auth crypto, realtime transport, and raw-SQL
  schema constraints. 50 tests pass.
- **Verification** — `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (50),
  `pnpm build` ✓, `pnpm dev` serves HTTP 200, Playwright E2E browsers installed
  and smoke tests pass (3/3) for page rendering.

## Current architecture

Server-authoritative three-layer split (Presentation / Server+Transport / pure
Domain) with persistence via Drizzle + Neon. Authentication, the authoritative
room service, realtime, and the event store live under `src/server`. See
[ARCHITECTURE.md](./ARCHITECTURE.md) and [MULTIPLAYER.md](./MULTIPLAYER.md).

## Known issues / limitations

- **No live database in this environment.** `DATABASE_URL` is not set;
  `getDb()` throws a clear error when absent, so the local dev daemon serves
  pages but **DB-backed auth/room operations require a configured Neon/Postgres**.
  Migrations were generated (not applied to a live DB) and validated via a
  schema-constraint suite on an in-memory Postgres emulator.
- **Drizzle over pg-mem is incompatible** (the `node-postgres` driver cannot
  hydrate row values from pg-mem), so the app-service DB integration tests use
  the domain layer + raw-SQL constraints instead of a full DB round-trip.
- **Realtime for dev is process-local** (`InMemoryRealtimeTransport`) and the SSE
  stream works in a single instance; a multi-instance Vercel deployment must
  substitute a distributed transport behind the same interface.
- The full multiplayer **game-flow E2E** (create → join → ready → start) could
  not be run end-to-end because it requires the database; only page-rendering
  smoke E2E passed.
- 3D / `@react-three/*` deps remain installed but unused (Phase 14).

## Next tasks

1. Wire up a Neon database (`DATABASE_URL`) and run `pnpm db:migrate` to apply
   migrations; verify the live DB-backed flow.
2. **Phase 2 — Turn Engine:** deterministic turn loop, action resolution, and
   server-authoritative turns on top of the session model.
