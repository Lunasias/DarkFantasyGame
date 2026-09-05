import type { Character } from "../engine/character";
import { GameError } from "../engine/errors";

export type EconomyEventType =
  | "GOLD_ADDED"
  | "GOLD_REMOVED"
  | "ITEM_PURCHASED"
  | "ITEM_SOLD";

export interface EconomyEvent {
  readonly type: EconomyEventType;
  readonly characterId: string;
  readonly data: Record<string, number | string>;
}

export interface GoldOptions {
  emit?: (event: EconomyEvent) => void;
}

/** Default starting gold for a new character (integer-safe). */
export const DEFAULT_GOLD = 100;

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new GameError("INVALID_ACTION", "Gold must be a non-negative safe integer");
  }
}

/** Authoritative read of a character's gold. */
export function getGold(character: Character): number {
  return character.gold;
}

/** Authoritative gold credit; never lets a balance overflow a safe integer. */
export function addGold(character: Character, amount: number, options: GoldOptions = {}): number {
  assertAmount(amount);
  const next = character.gold + amount;
  if (!Number.isSafeInteger(next)) {
    throw new GameError("INVALID_ACTION", "Gold overflow");
  }
  character.gold = next;
  options.emit?.({
    type: "GOLD_ADDED",
    characterId: character.id,
    data: { amount, gold: next },
  });
  return next;
}

/** Authoritative gold debit; rejects spending more than is owned. */
export function removeGold(character: Character, amount: number, options: GoldOptions = {}): number {
  assertAmount(amount);
  if (character.gold < amount) {
    throw new GameError("INVALID_ACTION", "Insufficient gold");
  }
  character.gold -= amount;
  options.emit?.({
    type: "GOLD_REMOVED",
    characterId: character.id,
    data: { amount, gold: character.gold },
  });
  return character.gold;
}
