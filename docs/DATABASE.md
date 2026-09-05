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
| `display_name` | `text` | not null |
| `password_hash` | `text` | `bcryptjs` hash; never returned to clients |
| `avatar_url` | `text` | |
| `created_at` / `updated_at` | `timestamptz` | |

### `sessions`
Server-side auth sessions. Only the hashed token is stored.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | cascade delete |
| `token_hash` | `text` | SHA-256, unique |
| `expires_at` | `timestamptz` | |
| `user_agent` | `text` | |

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
| `room_code` | `text` | unique join code |
| `name` | `text` | not null |
| `host_user_id` | `uuid` FK → `users.id` | cascade delete |
| `status` | `room_status` enum | `waiting/starting/in_game/finished/closed` |
| `max_players` | `int` | default 4 |
| `game_mode` / `ruleset` | `text` | defaults `standard`/`classic` |
| `visibility` | `room_visibility` enum | `public/private` |

### `room_players`
Join table of seated players.
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK → `rooms.id` | cascade delete |
| `user_id` | `uuid` FK → `users.id` | cascade delete |
| `profile_id` | `uuid` FK → `player_profiles.id` | set-null |
| `slot` | `int` | server-allocated seat index |
| `ready` | `boolean` | default false |
| `is_host` | `boolean` | default false |
| `connected` / `last_seen_at` | `boolean` / `timestamptz` | reconnect presence |
| `joined_at` | `timestamptz` | |
| — | unique (`room_id`, `user_id`) | prevents duplicate seats |
| — | unique (`room_id`, `slot`) | prevents slot collision / overfill |

### `game_sessions`
A started match (persisted counterpart of the engine `GameSession`).
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK → `rooms.id` | set null on delete |
| `phase` | `session_phase` enum | `lobby/active/finished` |
| `current_turn_number` | `int` | default 0 |
| `state_version` | `int` | default 0 (monotonic state counter) |
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

### `room_events`
Append-only server-sequenced room event stream (drives realtime + reconnect).
| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK → `rooms.id` | cascade delete |
| `actor_id` | `uuid` FK → `users.id` | set-null |
| `type` | `text` | event type |
| `sequence` | `int` | monotonic per room (unique with `room_id`) |
| `payload` | `jsonb` | |
| `created_at` | `timestamptz` | |

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

> Migrations are generated but **not** applied to a live database in this
> environment (no real credentials are present). Applying them is done via
> `pnpm db:migrate` once `DATABASE_URL` is set. The in-memory bootstrap used by
> tests/dev applies the committed snapshot at `src/db/schema.sql`, which is the
> full current-schema DDL (pg-mem cannot replay incremental `ALTER` migrations).

## Conventions

- Snake_case column names via explicit names (no auto-casing surprises).
- `timestamptz` for all timestamps.
- UUID primary keys generated client-side by default.
- Enums for status/phase; free text where extensibility matters.
