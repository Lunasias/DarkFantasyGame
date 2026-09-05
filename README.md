# DarkFantasyGame

An original, browser-based, online dark-fantasy **turn-based RPG board game**.
Strategic, cooperative and competitive multiplayer with persistent progression.

Built with **Next.js 16** (App Router, React 19, TypeScript), **Tailwind CSS**,
**Three.js / React Three Fiber / Drei**, **Drizzle ORM** on **Neon PostgreSQL**,
**Zod**, **Vitest** and **Playwright**, deployed on **Vercel**.

## Project status

Currently in **Phase 0 — Foundation**. See [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md)
for the live status and [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the full plan.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `pnpm dev`           | Start the dev server                 |
| `pnpm build`         | Production build (Turbopack)         |
| `pnpm start`         | Start the production server          |
| `pnpm lint`          | Run ESLint                           |
| `pnpm typecheck`     | Run `tsc --noEmit`                   |
| `pnpm test`          | Run Vitest (unit)                    |
| `pnpm test:e2e`      | Run Playwright (e2e, needs browsers) |
| `pnpm db:generate`   | Generate Drizzle migration SQL       |
| `pnpm db:migrate`    | Apply migrations to Neon             |
| `pnpm db:push`       | Push schema directly (dev)           |
| `pnpm db:studio`     | Open Drizzle Studio                  |

## Configuration

Copy `.env.example` to `.env.local` and fill in your own values. Real secrets
are git-ignored.

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and
[`docs/DATABASE.md`](./docs/DATABASE.md).

- `src/game` — framework-independent game engine (domain rules).
- `src/game/room` — lobby domain + room service.
- `src/db` — Drizzle + Neon client and schema.
- `src/server` — server/realtime transport seam.
- `src/app` — Next.js routes.
- `tests` — unit tests.

All game mechanics, names, data and art are **original IP**.
