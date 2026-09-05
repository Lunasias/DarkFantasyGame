# Roadmap

DarkFantasyGame is built incrementally. Each phase is a verified milestone that
keeps `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` green before
moving on.

| Phase | Name           | Goal |
| ----- | -------------- | ---- |
| 0     | Foundation     | Scaffold the Next.js/TS/Drizzle project, domain model, DB schema, room domain, docs, and tests. |
| 1     | Multiplayer    | Realtime transport + auth, room persistence, create/join/leave over the wire. |
| 2     | Turn Engine    | Full deterministic turn loop, action resolution, authoritativeness, server-authoritative turns. |
| 3     | Board          | Board generation, movement rules, node effects, pathfinding on the node graph. |
| 4     | Combat         | Encounter resolution, damage/defense, initiative, abilities, win/loss conditions. |
| 5     | Character System | Archetypes, stat growth, leveling, progression rules. |
| 6     | Jobs           | Job/class system branching on archetype, skill trees. |
| 7     | Items          | Inventory, equipment, item effects, loot rules. |
| 8     | Economy        | Gold, trading, vendors, pricing, sinks/sources. |
| 9     | Towns          | Town/travel nodes, safe zones, interactions. |
| 10    | Quests         | Quest chain model, objectives, rewards, persistence. |
| 11    | World Events   | Emergent global/regional events and modifiers. |
| 12    | Reconnect      | Session resumption, rejoin-after-disconnect, snapshot reconciliation. |
| 13    | Anti-Cheat     | Server authority, input validation, rate limiting, anomaly detection. |
| 14    | 3D             | Three.js / R3F / Drei board rendering, camera, scene, interactions. |
| 15    | Polish         | UI/UX, art pass, audio, accessibility, performance, motion. |
| 16    | Production     | Hardening, observability, load testing, Vercel + Neon deployment, launch. |

Each phase begins with a brief plan in `docs/PROJECT_STATE.md` and ends with
updated docs plus a passing verification run.

**Status:** Phase 0 (Foundation) ✅ complete · Phase 1 (Multiplayer Foundation)
✅ implemented · Phases 2+ not started.
