import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { combats } from "./combats";
import { timestamps, uuidPk } from "./shared";

/** A combatant attached to a combat (HP, effective stats snapshot at start). */
export const combatParticipants = pgTable(
  "combat_participants",
  {
    id: uuidPk(),
    combatId: uuid("combat_id")
      .notNull()
      .references(() => combats.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull(),
    hp: integer("hp").notNull(),
    maxHp: integer("max_hp").notNull(),
    attack: integer("attack").notNull(),
    defense: integer("defense").notNull(),
    alive: boolean("alive").notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("combat_participants_combat_id_idx").on(table.combatId),
    uniqueIndex("combat_participants_combat_character_unique").on(
      table.combatId,
      table.characterId,
    ),
  ],
);

export type CombatParticipant = typeof combatParticipants.$inferSelect;
export type NewCombatParticipant = typeof combatParticipants.$inferInsert;
