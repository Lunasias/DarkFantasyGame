# Project State

## Current phase

**Phase 0 — Foundation** (in progress → being verified for completion)

## Completed work

- **Project scaffold** — Next.js 16.3.4 (App Router, React 19.2), TypeScript
  5.9, Tailwind CSS v4, ESLint flat config. Turbopack is the default for
  `dev`/`build`.
- **Tooling** — Vitest + Playwright unit/e2e configs; Drizzle + Neon config;
  `pnpm` scripts (`dev`, `build`, `start`, `lint`, `lint:fix`, `typecheck`,
  `test`, `test:watch`, `test:e2e`, `db:*`); strict `tsc --noEmit`.
- **Dependencies** — `three`, `@react-three/fiber`, `@react-three/drei`,
  `drizzle-orm`, `@neondatabase/serverless`, `postgres`, `zod` (runtime);
  `drizzle-kit`, `vitest`, `@playwright/test` (dev).
- **Game engine (framework-independent)** — domain model under `src/game`:
  `GameSession`, `Player`, `Character`, `Turn`, `Action`, `GameEvent`,
  `Board`/`BoardNode`, plus a typed `GameError`/`RoomError` model.
- **Room domain** — `Room` (lobby), `RoomService` interface with an in-memory
  `InMemoryRoomService`, host/ready/max-players/status rules, and a
  `RealtimeTransport` seam for Phase 1.
- **Database foundation** — Drizzle schema for `users`, `player_profiles`,
  `characters`, `rooms`, `room_players`, `game_sessions`, `turns`,
  `game_events`, with PKs, FKs, indexes, unique/index constraints, enums, and
  relation mappings.
- **Configuration & hygiene** — `.env.example` (placeholders only), `.gitignore`
  (ignores real `.env*`), and a secret scanner (`scripts/check-secrets.mjs`).
- **Tests** — engine (session, player/character), board, and room domain tests.

## Current architecture

Clean three-layer split — Presentation (`src/app`), Server/Transport
(`src/server`), and a pure Domain (`src/game`), with persistence (`src/db`) and
shared types (`src/types`) beside them. The engine has no framework dependency.
See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Known issues / notes

- `DATABASE_URL` is **not** set (this is correct for Phase 0). Migrations have
  not been run against a live Neon instance; the schema is type-checked and is
  the source of truth.
- `next build` no longer runs linting (Next 16), so `lint` and `typecheck` are
  separate required gates.
- `@react-three/*` and `three` are installed but **not yet imported** — the 3D
  layer arrives in Phase 14.
- Playwright e2e requires an installed browser and a running `pnpm dev`; the
  `test:e2e` gate is deferred (Phase 1+). Unit tests are the Phase 0 gate.
- The remote `node_modules` junction relocation during scaffold setup was
  repaired by reinstalling from the project root; `pnpm install` is green.

## Verification (Phase 0 checklist — running against this tree)

- [x] `pnpm install` works
- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (27 tests)
- [x] `pnpm build` passes (Turbopack; route `/` static)
- [x] `pnpm dev` serves the app (HTTP 200, title "DarkFantasyGame")
- [x] Database foundation — Drizzle schema + generated migration (`drizzle/0000_*.sql`)
- [x] Game engine foundation present
- [x] Room foundation present
- [x] Documentation present
- [x] Git repo initialized, `.gitignore` set, secrets ignored, commit created

## Next tasks

1. Finish the Phase 0 verification run (fix any failures) and commit.
2. **Phase 1 — Multiplayer:** realtime transport + auth, room persistence, and
   create/join/leave over the wire.
