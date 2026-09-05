# Project State

## Current phase

**Phase 1.5 — Multiplayer Hardening** (implemented; being committed)

Phase 0 (Foundation) and Phase 1 (Multiplayer Foundation) are complete and
committed. Phase 1.5 is a hardening pass only — no new game features.

## Completed work (Phase 1.5)

- **Authentication hardening** (`src/lib/auth`)
  - Timing-safe login: a dummy bcrypt comparison runs for unknown users so the
    response time doesn't reveal whether an account exists.
  - Per-client rate limiting (client IP) for `login`/`register` instead of a
    per-email key, so enumeration/brute-force is throttled regardless of email.
  - `pruneExpiredSessions()` cleanup; expired sessions are also deleted on
    validate. `isSessionExpired`/`isWellFormedToken` are pure and unit-tested.
  - Confirmed cookie flags (`httpOnly`, `sameSite=lax`, `secure` in prod),
    token entropy/hashing, logout revocation, and new-token-per-login rotation
    (no session fixation).
- **Room authorization hardening** (`src/server/room/authorization.ts`) — pure
  `isRoomMember` / `requireRoomMember` / `isRoomHost` shared by the read path and
  the SSE stream; added membership-checks + per-user rate limiting to the SSE
  route.
- **Input validation** — audited all server actions (Zod); fixed `joinRoomSchema`
  to uppercase before validating the code shape so lower-case codes are accepted.
- **Distributed realtime seam** — `DistributedRealtimeTransport` interface
  (`src/server/realtime/distributed.ts`) + documented provider options/trade-offs
  (no provider implemented).
- **Security / hardening tests** — input validation, cookie + session policy,
  room authorization, and rate limiter suites added. **69 tests pass.**
- **Docs** — MULTIPLAYER/ARCHITECTURE/DATABASE/PROJECT_STATE updated with the
  security model, auth lifecycle, room authorization, realtime + rate-limit
  limitations, distributed realtime seam, concurrency guarantees, and remaining
  production requirements.

## Known issues / limitations

- **No live database.** `DATABASE_URL` is unset; `getDb()` throws clearly when
  absent, so the dev daemon serves pages but DB-backed auth/room operations
  require a configured Neon/Postgres. Migrations were generated (not applied)
  and schema constraints validated with an in-memory Postgres emulator.
- **Drizzle over pg-mem is incompatible**, so DB-backed integration/concurrency
  tests use the domain layer + raw-SQL constraint tests. **True concurrent
  PostgreSQL races are not claimed** (no real DB).
- **Realtime is single-process** (in-memory + SSE). Multi-instance distributed
  realtime and distributed presence are designed but not implemented. The
  in-memory transport is not production distributed realtime.
- **Rate limiting is in-memory / single-process**, not a production distributed
  limiter.
- Register still surfaces a duplicate-email message (known enumeration vector,
  mitigated by per-client rate limiting).
- The full multiplayer game-flow E2E (create → join → ready → start) requires
  the database and was not run; only page-rendering smoke E2E passed.

## Next tasks

1. Wire up a Neon database (`DATABASE_URL`) and run `pnpm db:migrate`; run the
   live DB-backed flow + concurrency tests.
2. Substitute a distributed realtime transport + presence and a distributed rate
   limiter for multi-instance production.
3. **Phase 2 — Turn Engine** (deterministic turn loop on the session model).
