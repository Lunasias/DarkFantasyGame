# Database

DarkFantasyGame uses **Neon PostgreSQL** through **Drizzle ORM**. This document
covers the Phase 0 schema, relationships, and how to run migrations.

## Driver & client

- `drizzle-orm` + `@neondatabase/serverless` (HTTP/serverless driver).
- `DATABASE_URL` is read from the environment; placeholders live in
  [`.env.example`](../.env.example).
- `src/db/index.ts` exports a lazy `getDb()` singleton — it is only imported
  from server code and never bundled for the browser.

## Configuration

`drizzle.config.ts` points at the schema barrel and writes generated SQL to
`drizzle/`.

```
dialect:   postgresql
schema:    src/db/schema/index.ts
out:       drizzle
```

## Tables

### `users`
Authentication/identity boundary.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | `defaultRandom()` |
| `email` | `text` | unique, not null |
| `display_name` | `text` | |
| `avatar_url` | `text` | |
| `created_at` / `updated_at` | `timestamptz` | |

### `player_profiles`
One per user — the root of persistent progression.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | cascade delete |
| `player_name` | `text` | not null |
| `level` | `int` | default 1 |
| `total_gold` | `int` | default 0 |

### `characters`
An avatar owned by a profile.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK → `player_profiles.id` | cascade delete |
| `name` | `text` | not null |
| `archetype` | `text` | free-text tag (Job system expands this) |
| `level` / `health` / `max_health` | `int` | |

### `rooms`
A pre-game lobby.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` | not null |
| `host_user_id` | `uuid` FK → `users.id` | cascade delete |
| `status` | `room_status` enum | `waiting/ready/in_progress/closed` |
| `max_players` | `int` | default 4 |

### `room_players`
Join table of seated players.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK → `rooms.id` | cascade delete |
| `user_id` | `uuid` FK → `users.id` | cascade delete |
| `ready` | `boolean` | default false |
| `is_host` | `boolean` | default false |
| `joined_at` | `timestamptz` | |
| — | unique (`room_id`, `user_id`) | prevents duplicate seats |

### `game_sessions`
A started match (persisted counterpart of the engine `GameSession`).
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK → `rooms.id` | set null on delete |
| `phase` | `session_phase` enum | `lobby/active/finished` |
| `current_turn_number` | `int` | default 0 |
| `config` | `jsonb` | |
| `started_at` | `timestamptz` | |

### `turns`
One persisted turn.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `game_session_id` | `uuid` FK → `game_sessions.id` | cascade delete |
| `turn_number` | `int` | |
| `player_id` | `uuid` | actor |
| `state` | `jsonb` | board/combat snapshot |
| `ended_at` | `timestamptz` | |

### `game_events`
Append-only event stream.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `game_session_id` | `uuid` FK → `game_sessions.id` | cascade delete |
| `type` | `text` | `GameEventType` |
| `sequence` | `int` | default 0 |
| `payload` | `jsonb` | |

## Relationships

Foreign keys are declared on the table definitions. `relations.ts` adds
query-builder traversal:

- `users` 1→1 `player_profiles`; 1→many `rooms` (hosted), `room_players`
- `player_profiles` 1→many `characters`
- `rooms` 1→many `room_players`, `game_sessions`
- `game_sessions` 1→many `turns`, `game_events`

All one-to-many endpoints are indexed on their FK column.

## Migrations

```bash
pnpm db:generate   # generate SQL from schema changes
pnpm db:migrate    # apply migrations to the Neon database
pnpm db:push       # push schema directly (dev convenience)
pnpm db:studio     # open Drizzle Studio
```

> Phase 0 does **not** run migrations against a live database (no real
> credentials are present). The schema is the authoritative definition and is
> fully type-checked; migrations are generated when a Neon instance is wired up.

## Conventions

- Snake_case column names via explicit names (no auto-casing surprises).
- `timestamptz` for all timestamps.
- UUID primary keys generated client-side by default.
- Enums for status/phase; free text where extensibility matters.
