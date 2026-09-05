import { relations } from "drizzle-orm";
import { characterInventory } from "./character-inventory";
import { characters } from "./characters";
import { characterQuests } from "./character-quests";
import { questProgress } from "./quest-progress";
import { worldEventClaims } from "./world-event-claims";
import { dungeonEntries } from "./dungeon-entries";
import { gameEvents } from "./game-events";
import { shopInventory } from "./shop-inventory";
import { gameSessions } from "./game-sessions";
import { items } from "./items";
import { playerProfiles } from "./player-profiles";
import { roomEvents } from "./room-events";
import { roomPlayers } from "./room-players";
import { rooms } from "./rooms";
import { sessions } from "./sessions";
import { shops } from "./shops";
import { turns } from "./turns";
import { users } from "./users";

/**
 * Query-builder relations (relational joins available through Drizzle). These
 * describe traversal relationships only — the physical foreign keys live on the
 * table definitions above.
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  playerProfile: one(playerProfiles, {
    fields: [users.id],
    references: [playerProfiles.userId],
  }),
  sessions: many(sessions),
  hostedRooms: many(rooms),
  roomMemberships: many(roomPlayers),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const playerProfilesRelations = relations(
  playerProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [playerProfiles.userId],
      references: [users.id],
    }),
    characters: many(characters),
    roomMemberships: many(roomPlayers),
  }),
);

export const charactersRelations = relations(characters, ({ one, many }) => ({
  profile: one(playerProfiles, {
    fields: [characters.profileId],
    references: [playerProfiles.id],
  }),
  inventory: many(characterInventory),
  quests: many(characterQuests),
  questProgress: many(questProgress),
  worldEventClaims: many(worldEventClaims),
  dungeonEntries: many(dungeonEntries),
}));

export const characterQuestsRelations = relations(characterQuests, ({ one }) => ({
  character: one(characters, {
    fields: [characterQuests.characterId],
    references: [characters.id],
  }),
}));

export const questProgressRelations = relations(questProgress, ({ one }) => ({
  character: one(characters, {
    fields: [questProgress.characterId],
    references: [characters.id],
  }),
}));

export const worldEventClaimsRelations = relations(worldEventClaims, ({ one }) => ({
  character: one(characters, {
    fields: [worldEventClaims.characterId],
    references: [characters.id],
  }),
}));

export const dungeonEntriesRelations = relations(dungeonEntries, ({ one }) => ({
  character: one(characters, {
    fields: [dungeonEntries.characterId],
    references: [characters.id],
  }),
}));

export const characterInventoryRelations = relations(
  characterInventory,
  ({ one }) => ({
    character: one(characters, {
      fields: [characterInventory.characterId],
      references: [characters.id],
    }),
    item: one(items, {
      fields: [characterInventory.itemId],
      references: [items.id],
    }),
  }),
);

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, {
    fields: [rooms.hostUserId],
    references: [users.id],
  }),
  members: many(roomPlayers),
  sessions: many(gameSessions),
  events: many(roomEvents),
}));

export const roomPlayersRelations = relations(roomPlayers, ({ one }) => ({
  room: one(rooms, {
    fields: [roomPlayers.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [roomPlayers.userId],
    references: [users.id],
  }),
  profile: one(playerProfiles, {
    fields: [roomPlayers.profileId],
    references: [playerProfiles.id],
  }),
}));

export const shopInventoryRelations = relations(shopInventory, ({ one }) => ({
  shop: one(shops, {
    fields: [shopInventory.shopId],
    references: [shops.id],
  }),
  item: one(items, {
    fields: [shopInventory.itemId],
    references: [items.id],
  }),
}));

export const gameSessionsRelations = relations(
  gameSessions,
  ({ one, many }) => ({
    room: one(rooms, {
      fields: [gameSessions.roomId],
      references: [rooms.id],
    }),
    turns: many(turns),
    events: many(gameEvents),
  }),
);

export const turnsRelations = relations(turns, ({ one }) => ({
  session: one(gameSessions, {
    fields: [turns.gameSessionId],
    references: [gameSessions.id],
  }),
}));

export const gameEventsRelations = relations(gameEvents, ({ one }) => ({
  session: one(gameSessions, {
    fields: [gameEvents.gameSessionId],
    references: [gameSessions.id],
  }),
  actor: one(users, {
    fields: [gameEvents.actorId],
    references: [users.id],
  }),
}));

export const roomEventsRelations = relations(roomEvents, ({ one }) => ({
  room: one(rooms, {
    fields: [roomEvents.roomId],
    references: [rooms.id],
  }),
  actor: one(users, {
    fields: [roomEvents.actorId],
    references: [users.id],
  }),
}));
