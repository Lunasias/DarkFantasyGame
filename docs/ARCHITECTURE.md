# Architecture

DarkFantasyGame is a browser-based, online dark-fantasy turn-based RPG board
game. This document describes the architecture implemented in Phase 0 and the
principles that will guide later phases.

## Tech stack

| Concern            | Choice                                                  |
| ------------------ | ------------------------------------------------------- |
| Framework          | Next.js 16 (App Router, React 19, TypeScript)            |
| Styling            | Tailwind CSS v4                                          |
| 3D rendering       | Three.js + React Three Fiber + Drei (bundled, Phase 14)  |
| Database           | Neon PostgreSQL (serverless)                             |
| ORM                | Drizzle ORM                                              |
| Validation         | Zod                                                      |
| Testing            | Vitest (unit) + Playwright (e2e)                         |
| Package manager    | pnpm                                                    |
| Deployment         | Vercel                                                  |

## Layer boundaries

The system is split into three layers with a strict dependency direction.
Lower layers never depend on higher ones.

```
┌──────────────────────────────────────────────┐
│  Presentation (src/app, src/components)       │  React/Next; never imports engine rules
├──────────────────────────────────────────────┤
│  Server / Transport (src/server)              │  route handlers, realtime seam
├──────────────────────────────────────────────┤
│  Domain (src/game)                            │  pure rules; zero framework deps
└──────────────────────────────────────────────┘
            ▲            ▲
   persistence (src/db)  shared types (src/types)
```

### Domain layer — framework-independent engine

`src/game` is pure TypeScript with **no** React, Three.js, or server-framework
imports. It can run under Node.js, in Vitest, and (later) in an isolated
simulation worker. Key module groups:

- `engine/` — the deterministic core: `GameSession`, `Player`, `Character`,
  `Turn`, `Action`, `GameEvent` (see the domain notes below).
- `board/` — `Board` (a graph of `BoardNode`s). Models the board as nodes +
  adjacency, so the same rules drive a hex, square, or 3D layout.
- `room/` — the pre-game lobby: `Room`, `RoomService` (in-memory impl), plus the
  `RoomPlayer`/`RoomStatus` types.

### The room → session hand-off

A `Room` is a lobby. When a room starts, a `GameSession` is created and moves
into active play. `RoomService` is defined as an interface with an in-memory
implementation so a database-backed / realtime-broadcasting service can replace
it later **without changing the domain or callers**.

### Persistence

`src/db` configures Drizzle ORM for Neon PostgreSQL and defines the schema
(`src/db/schema/`). The `getDb()` singleton is lazy and only imported from
server code. See [DATABASE.md](./DATABASE.md).

### Realtime seam

`src/server/transport.ts` defines `RealtimeTransport` — a publish/subscribe
seam. The domain never talks to a socket library; Phase 1 will provide a
concrete transport behind this interface.

## Domain model (Phase 0)

- **`GameSession`** — authoritative state for one match. Owns the `lobby →
  active → finished` lifecycle, turn rotation, and action validation. Emits an
  append-only `GameEvent` log.
- **`Player`** — the transport-facing identity (session seat).
- **`Character`** — the in-world avatar a player controls.
- **`Turn`** — one ordinal step attributed to a player.
- **`Action`** — a validated player instruction (`move`/`attack`/`use_item`/
  `end_turn`). Only `end_turn` has full behaviour in Phase 0.
- **`GameEvent`** — immutable domain event for persistence + realtime sync.
- **`Board` / `BoardNode`** — the graph the game is played on.

## Directory layout

```
src/
  app/            Next.js routes (pages/layout/styles)
  components/     UI components (populated in later phases)
  features/       Feature slices (populated later)
  game/
    engine/       deterministic simulation core
    board/        board graph
    characters/   (character domain lives under engine/ for now)
    room/         lobby domain + service seam
    combat/       Phase 4
    jobs/         Phase 6
    items/        Phase 7
    quests/       Phase 10
    economy/      Phase 8
    towns/        Phase 9
    events/       Phase 11
  server/         route handlers + realtime seam
  db/             Drizzle client + schema
  lib/            shared helpers (env validation)
  types/          shared + api types
tests/            Vitest unit tests
e2e/              Playwright e2e tests
scripts/          repo tooling (secret scanner)
docs/             this documentation
drizzle/          generated SQL migrations
```

> Not every `game/*` subfolder exists yet. The listed folders are the planned
> boundary for each future phase; empty folders are created when they gain real
> content (per the "no unnecessary abstraction" rule).

## Principles

1. **The engine never renders.** Rules stay pure; presentation adapts to them.
2. **Determinism first.** State transitions are explicit and testable.
3. **Seams over hard-wiring.** Realtime, persistence, and rendering all plug in
   behind interfaces.
4. **Original IP.** No copyrighted characters, maps, names, artwork, or
   formulas are used anywhere.

## Multiplayer server layer (Phase 1)

The server layer (`src/server`, `src/lib/auth`) sits between the domain and the
presentation and is always authoritative:

- **Authentication** (`src/lib/auth`) — `AuthService` (email/password via
  `bcryptjs`), hashed opaque session tokens (`sessions` table), `httpOnly`
  cookie, `requireUser()`. Identity is never client-supplied.
- **Authoritative room application service**
  (`src/server/room/room-app-service.ts`) — transactional, auth-aware room
  operations backed by a formal state machine.
- **Realtime** (`src/server/realtime`) — provider-independent
  `RealtimeTransport`, an in-memory implementation, and an SSE stream; the
  transport is never the source of truth.
- **Errors / rate limiting** (`src/server/errors.ts`,
  `src/server/rate-limit`) — typed `AppError` codes and a `RateLimiter` seam.

See [MULTIPLAYER.md](./MULTIPLAYER.md) for the full design.

### Directory additions

```
src/lib/auth/        auth service, sessions, cookies, schemas
src/lib/result.ts    typed ActionResult helpers
src/server/errors.ts app error codes/mapping
src/server/room/     authoritative room service + actions + zod schemas
src/server/realtime/ transport interface + in-memory + hub + event types
src/server/rate-limit/ rate limiter seam
src/app/api/         /api/me, /api/rooms/[roomCode]/stream
src/app/{login,register,lobby,rooms/create,rooms/[roomCode]}  UI
```
