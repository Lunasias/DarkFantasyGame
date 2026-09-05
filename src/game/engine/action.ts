import type { PlayerId } from "./types";

/**
 * The set of action types understood by the turn-based engine in Phase 0.
 * Later phases (combat, items, towns) will extend this list; the engine should
 * validate against an explicit allow-list so unknown client actions are
 * rejected instead of silently accepted.
 */
export const ACTION_TYPES = [
  "move",
  "attack",
  "use_item",
  "end_turn",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * A single player-issued instruction inside a turn. The engine validates the
 * action (type + ordering) before applying it to the session state.
 */
export interface Action {
  readonly type: ActionType;
  readonly playerId: PlayerId;
  readonly payload?: Record<string, unknown>;
}

/** Guard that narrows an arbitrary value to a known {@link ActionType}. */
export function isActionType(value: unknown): value is ActionType {
  return (
    typeof value === "string" &&
    (ACTION_TYPES as readonly string[]).includes(value)
  );
}
